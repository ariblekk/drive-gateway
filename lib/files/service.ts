import crypto from "node:crypto";
import { createWriteStream } from "node:fs";
import { rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";

import { and, desc, eq, isNull, like, sql } from "drizzle-orm";

import { recordActivity } from "@/lib/activity";
import {
  buckets,
  files,
  getDb,
  googleAccounts,
  type GoogleAccount,
  type StoredFile,
} from "@/lib/db";
import { errorMessage, GatewayError } from "@/lib/errors";
import { classifyMimeType, emptyTypeUsage } from "@/lib/files/mime";
import {
  getFolderById,
  getFolderPath,
} from "@/lib/folders/service";
import { syncAccountQuota } from "@/lib/google/quota";
import { rankAccounts } from "@/lib/google/selection";
import { adjustTypeUsage } from "@/lib/google/usage";
import { keyFromPath } from "@/lib/s3/keys";
import {
  deleteFromBackend,
  downloadFromBackend,
  getBackendChecksum,
  uploadToBackend,
} from "@/lib/storage/backend";

const QUOTA_STALE_MS = 5 * 60 * 1000;
const MAX_UPLOAD_ATTEMPTS = 3;

export type UploadDataSource =
  | ReadableStream<Uint8Array>
  | AsyncIterable<Uint8Array>;

export interface SaveUploadInput {
  data: UploadDataSource;
  name: string;
  mimeType: string;
  path?: string;
  folderId?: string | null;
  size?: number;
  apiKeyId?: string | null;
  bucketId?: string;
  key?: string;
  metadata?: Record<string, unknown>;
  expectedMd5?: string;
  expectedSha256?: string;
  maxBytes?: number;
  s3CredentialId?: string | null;
}

type TempFile = {
  tempPath: string;
  size: number;
  md5: string;
  sha256: string;
};

function isWebStream(
  data: UploadDataSource,
): data is ReadableStream<Uint8Array> {
  return typeof (data as ReadableStream<Uint8Array>).getReader === "function";
}

async function writeTempFile(
  data: UploadDataSource,
  maxBytes?: number,
): Promise<TempFile> {
  const tempPath = path.join(
    os.tmpdir(),
    `gdrive-gateway-${crypto.randomUUID()}`,
  );
  const nodeStream = isWebStream(data)
    ? Readable.fromWeb(data as unknown as NodeReadableStream)
    : Readable.from(data);
  const md5 = crypto.createHash("md5");
  const sha256 = crypto.createHash("sha256");
  let total = 0;
  const hashing = new Transform({
    transform(chunk, _encoding, callback) {
      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk);
      total += buffer.length;

      if (maxBytes && total > maxBytes) {
        callback(
          new GatewayError(
            "payload_too_large",
            "Uploaded body exceeds the configured limit",
            413,
          ),
        );
        return;
      }

      md5.update(buffer);
      sha256.update(buffer);
      callback(null, buffer);
    },
  });

  await pipeline(
    nodeStream,
    hashing,
    createWriteStream(tempPath),
  );

  const stats = await stat(tempPath);

  return {
    tempPath,
    size: stats.size,
    md5: md5.digest("hex"),
    sha256: sha256.digest("hex"),
  };
}

async function refreshStaleQuotas(accounts: GoogleAccount[]): Promise<void> {
  const now = Date.now();
  const stale = accounts.filter(
    (account) =>
      account.status === "active" &&
      (!account.lastQuotaSync || now - account.lastQuotaSync > QUOTA_STALE_MS),
  );

  if (stale.length === 0) {
    return;
  }

  await Promise.allSettled(
    stale.map((account) => syncAccountQuota(account)),
  );
}

export function normalizeVirtualPath(value: string): string {
  const trimmed = value.trim();

  if (!trimmed || trimmed === "/") {
    return "/";
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;

  return withLeadingSlash.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

export function sanitizeFileName(value: string): string {
  const base = value.split(/[\\/]/).pop() ?? "file";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[:*?"<>|]/g, "_")
    .trim();

  return (cleaned || "file").slice(0, 200);
}

export async function saveUpload(
  input: SaveUploadInput,
): Promise<StoredFile> {
  const temp = await writeTempFile(input.data, input.maxBytes);

  try {
    if (
      input.expectedMd5 &&
      input.expectedMd5.toLowerCase() !== temp.md5
    ) {
      throw new GatewayError(
        "bad_request",
        "Content-MD5 does not match the uploaded body",
        400,
      );
    }

    if (
      input.expectedSha256 &&
      input.expectedSha256 !== "UNSIGNED-PAYLOAD" &&
      input.expectedSha256.toLowerCase() !== temp.sha256
    ) {
      throw new GatewayError(
        "bad_request",
        "x-amz-content-sha256 does not match the uploaded body",
        400,
      );
    }

    return await uploadTempFile({
      tempPath: temp.tempPath,
      name: input.name,
      mimeType: input.mimeType,
      path: input.path,
      folderId: input.folderId ?? null,
      size: temp.size,
      apiKeyId: input.apiKeyId ?? null,
      s3CredentialId: input.s3CredentialId ?? null,
      bucketId: input.bucketId,
      key: input.key,
      metadata: input.metadata,
      md5: temp.md5,
      sha256: temp.sha256,
    });
  } finally {
    await rm(temp.tempPath, { force: true }).catch(
      () => undefined,
    );
  }
}

export async function saveUploadFromPath(input: {
  tempPath: string;
  name: string;
  mimeType: string;
  path?: string;
  folderId?: string | null;
  size?: number;
  apiKeyId?: string | null;
  s3CredentialId?: string | null;
  bucketId?: string;
  key?: string;
  metadata?: Record<string, unknown>;
  md5?: string;
  sha256?: string;
}): Promise<StoredFile> {
  return uploadTempFile(input);
}

async function uploadTempFile(input: {
  tempPath: string;
  name: string;
  mimeType: string;
  path?: string;
  folderId?: string | null;
  size?: number;
  apiKeyId?: string | null;
  s3CredentialId?: string | null;
  bucketId?: string;
  key?: string;
  metadata?: Record<string, unknown>;
  md5?: string;
  sha256?: string;
}): Promise<StoredFile> {
  const stats = await stat(input.tempPath);
  const size = input.size ?? stats.size;
  const db = getDb();
  const folderId = input.folderId ?? null;
  let virtualPath = normalizeVirtualPath(input.path ?? "/");

  if (folderId) {
    const folder = getFolderById(folderId);

    if (folder.status !== "active") {
      throw new GatewayError(
        "bad_request",
        "Target folder is not active",
        400,
      );
    }

    virtualPath = getFolderPath(folderId);
  }

  const bucketId = input.bucketId ?? "default";
  const objectKey =
    input.key ?? keyFromPath(virtualPath, input.name);

  let accounts = db.select().from(googleAccounts).all();
  await refreshStaleQuotas(accounts);
  accounts = db.select().from(googleAccounts).all();

  const targetBucket = db
    .select({ storageAccountId: buckets.storageAccountId })
    .from(buckets)
    .where(eq(buckets.id, bucketId))
    .get();

  if (targetBucket?.storageAccountId) {
    accounts = accounts.filter((a) => a.id === targetBucket.storageAccountId);
  }

  const ranked = rankAccounts(accounts, size);

  if (ranked.length === 0) {
    throw new GatewayError(
      "no_capacity",
      "No connected Google account has enough free space",
      507,
    );
  }

  const tried = new Set<string>();
  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_UPLOAD_ATTEMPTS; attempt += 1) {
    const account = ranked.find((candidate) => !tried.has(candidate.id));

    if (!account) {
      break;
    }

    tried.add(account.id);

    try {
      const now = Date.now();
      const id = crypto.randomUUID();
      let md5Checksum: string | null = null;

      const uploaded = await uploadToBackend(account, {
        filePath: input.tempPath,
        name: input.name,
        mimeType: input.mimeType,
        fileId: id,
        md5: input.md5,
      });
      const remoteId = uploaded.remoteId;
      md5Checksum = uploaded.md5Checksum ?? null;

      db.insert(files)
        .values({
          id,
          accountId: account.id,
          folderId,
          driveFileId: remoteId,
          bucketId,
          key: objectKey,
          etag: input.md5 ?? md5Checksum ?? null,
          metadata: input.metadata
            ? JSON.stringify(input.metadata)
            : null,
          s3CredentialId: input.s3CredentialId ?? null,
          name: input.name,
          mimeType: input.mimeType,
          size,
          path: virtualPath,
          status: "active",
          createdAt: now,
          updatedAt: now,
        })
        .run();

      db.update(googleAccounts)
        .set({
          lastUsedAt: now,
          quotaUsage: account.quotaUsage + size,
          updatedAt: now,
        })
        .where(eq(googleAccounts.id, account.id))
        .run();

      adjustTypeUsage(account.id, input.mimeType, size, 1);

      recordActivity({
        action: "upload",
        fileId: id,
        accountId: account.id,
        apiKeyId: input.apiKeyId ?? null,
        bytes: size,
        status: "ok",
      });

      const stored = db
        .select()
        .from(files)
        .where(eq(files.id, id))
        .get();

      if (!stored) {
        throw new Error("Failed to persist file metadata");
      }

      return stored;
    } catch (error) {
      lastError = error;
      const message = errorMessage(error);

      try {
        await syncAccountQuota(account);
      } catch {
        // Quota refresh is best effort; keep the original upload error.
      }

      db.update(googleAccounts)
        .set({ lastError: message.slice(0, 500), updatedAt: Date.now() })
        .where(eq(googleAccounts.id, account.id))
        .run();

      recordActivity({
        action: "upload",
        accountId: account.id,
        apiKeyId: input.apiKeyId ?? null,
        bytes: size,
        status: "error",
        message: message.slice(0, 500),
      });
    }
  }

  if (lastError instanceof GatewayError) {
    throw lastError;
  }

  throw new GatewayError(
    "upload_failed",
    lastError
      ? errorMessage(lastError)
      : "Failed to upload to any connected Google account",
    502,
  );
}

export function listFiles(
  options: {
    bucketId?: string | null;
    q?: string;
    status?: string;
    folderId?: string | null;
    limit?: number;
    offset?: number;
  } = {},
) {
  const db = getDb();
  const status = options.status ?? "active";
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);

  const conditions = [];

  if (status !== "all") {
    conditions.push(eq(files.status, status));
  }

  if (options.bucketId) {
    conditions.push(eq(files.bucketId, options.bucketId));
  }

  if (options.folderId === "root") {
    conditions.push(isNull(files.folderId));
  } else if (options.folderId) {
    conditions.push(eq(files.folderId, options.folderId));
  }

  if (options.q) {
    conditions.push(like(files.name, `%${options.q}%`));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select()
    .from(files)
    .where(where)
    .orderBy(desc(files.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  const totalRow = db
    .select({ count: sql<number>`count(*)` })
    .from(files)
    .where(where)
    .get();

  return {
    files: rows,
    total: Number(totalRow?.count ?? 0),
    limit,
    offset,
  };
}

export function getFileById(
  id: string,
  options: { includeTrashed?: boolean } = {},
): StoredFile {
  const file = getDb().select().from(files).where(eq(files.id, id)).get();

  if (!file || (!options.includeTrashed && file.status !== "active")) {
    throw new GatewayError("not_found", "File not found", 404);
  }

  return file;
}

export function getFileByBucketKey(
  bucketId: string,
  key: string,
): StoredFile | null {
  return (
    getDb()
      .select()
      .from(files)
      .where(
        and(
          eq(files.bucketId, bucketId),
          eq(files.key, key),
          eq(files.status, "active"),
        ),
      )
      .orderBy(desc(files.updatedAt))
      .get() ?? null
  );
}

export function updateFileEtag(id: string, etag: string): void {
  getDb()
    .update(files)
    .set({ etag })
    .where(eq(files.id, id))
    .run();
}

export async function ensureFileEtag(
  file: StoredFile,
): Promise<string> {
  if (file.etag) {
    return file.etag;
  }

  try {
    const account = getAccountById(file.accountId);

    const checksum = await getBackendChecksum(account, file.driveFileId);
    const etag = checksum?.md5Checksum ?? file.id;
    updateFileEtag(file.id, etag);
    return etag;
  } catch {
    return file.id;
  }
}

export function getAccountById(id: string): GoogleAccount {
  const account = getDb()
    .select()
    .from(googleAccounts)
    .where(eq(googleAccounts.id, id))
    .get();

  if (!account) {
    throw new GatewayError("not_found", "Account not found", 404);
  }

  return account;
}

export async function openFileDownload(
  id: string,
  range?: string | null,
): Promise<{
  file: StoredFile;
  account: GoogleAccount;
  response: {
    data: Readable;
    status: number;
    headers: Record<string, string>;
  };
}> {
  const file = getFileById(id);
  const account = getAccountById(file.accountId);

  const response = await downloadFromBackend(
    account,
    file.driveFileId,
    range,
  );

  recordActivity({
    action: "download",
    fileId: file.id,
    accountId: account.id,
    bytes: file.size,
    status: "ok",
  });

  return { file, account, response };
}

export async function deleteFilePermanentlyById(
  id: string,
  apiKeyId?: string | null,
  deleteRemote = true,
): Promise<StoredFile> {
  const db = getDb();
  const file = getFileById(id, { includeTrashed: true });

  const account = db
    .select()
    .from(googleAccounts)
    .where(eq(googleAccounts.id, file.accountId))
    .get();

  if (deleteRemote && account && account.status !== "disconnected") {
    try {
      await deleteFromBackend(account, file.driveFileId);
    } catch (error) {
      const message = errorMessage(error);

      if (!/not found|404/i.test(message)) {
        throw error;
      }
    }
  }

  if (file.status === "active") {
    adjustTypeUsage(file.accountId, file.mimeType, -file.size, -1);
  }

  db.delete(files).where(eq(files.id, id)).run();

  recordActivity({
    action: "delete",
    fileId: id,
    accountId: file.accountId,
    apiKeyId: apiKeyId ?? null,
    bytes: file.size,
    status: "ok",
  });

  return file;
}

export function getGlobalStats() {
  const db = getDb();
  const accounts = db.select().from(googleAccounts).all();

  const fileStats = db
    .select({
      count: sql<number>`count(*)`,
      size: sql<number>`coalesce(sum(${files.size}), 0)`,
    })
    .from(files)
    .where(eq(files.status, "active"))
    .get();

  let totalLimitBytes = 0;
  let totalUsedBytes = 0;
  let unlimitedAccounts = 0;

  const projectUsage = db
    .select({ accountId: files.accountId, bytes: sql<number>`coalesce(sum(${files.size}), 0)` })
    .from(files)
    .where(eq(files.status, "active"))
    .groupBy(files.accountId)
    .all();
  const projectUsageByAccount = new Map(
    projectUsage.map(({ accountId, bytes }) => [accountId, Number(bytes)]),
  );

  const visibleAccounts = accounts.filter(
    (account) => account.status !== "disconnected",
  );

  for (const account of visibleAccounts) {
    if (account.quotaLimit === null) {
      unlimitedAccounts += 1;
      continue;
    }

    totalLimitBytes += account.quotaLimit;
    totalUsedBytes += account.quotaUsage;
  }

  return {
    accounts: visibleAccounts.length,
    unlimitedAccounts,
    totalFiles: Number(fileStats?.count ?? 0),
    totalFileBytes: Number(fileStats?.size ?? 0),
    totalLimitBytes,
    totalUsedBytes,
    totalFreeBytes: Math.max(0, totalLimitBytes - totalUsedBytes),
    perAccount: visibleAccounts.map((account) => ({
      id: account.id,
      provider: account.provider as "google" | "s3",
      email: account.email,
      displayName: account.displayName,
      s3Endpoint: account.s3Endpoint,
      s3Bucket: account.s3Bucket,
      status: account.status,
      quotaLimit: account.quotaLimit,
      quotaUsage: account.quotaUsage,
      projectUsageBytes: projectUsageByAccount.get(account.id) ?? 0,
      lastUsedAt: account.lastUsedAt,
      quotaUsageInDrive: account.quotaUsageInDrive,
      lastQuotaSync: account.lastQuotaSync,
      lastError: account.lastError,
    })),
  };
}

export async function getStorageSummary() {
  const db = getDb();
  const accounts = db
    .select()
    .from(googleAccounts)
    .all()
    .filter((account) => account.status !== "disconnected");

  let limitBytes = 0;
  let usedBytes = 0;
  let unlimitedAccounts = 0;

  for (const account of accounts) {
    if (account.quotaLimit === null) {
      unlimitedAccounts += 1;
      continue;
    }

    limitBytes += account.quotaLimit;
    usedBytes += account.quotaUsage;
  }

  const breakdown = emptyTypeUsage();

  const indexedRows = db
    .select({ mimeType: files.mimeType, size: files.size })
    .from(files)
    .where(eq(files.status, "active"))
    .all();

  let indexedBytes = 0;

  for (const row of indexedRows) {
    indexedBytes += row.size;
  }

  for (const row of indexedRows) {
    const category = classifyMimeType(row.mimeType);
    breakdown[category].bytes += row.size;
    breakdown[category].count += 1;
  }

  return {
    limitBytes,
    usedBytes,
    freeBytes: Math.max(0, limitBytes - usedBytes),
    unlimitedAccounts,
    accounts: accounts.length,
    indexedBytes,
    indexedFiles: indexedRows.length,
    breakdown,
  };
}
