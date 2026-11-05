import crypto from "node:crypto";
import { createWriteStream } from "node:fs";
import { rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";

import { and, desc, eq, isNull, like, sql } from "drizzle-orm";

import { recordActivity } from "@/lib/activity";
import {
  files,
  getDb,
  googleAccounts,
  typeUsage,
  type GoogleAccount,
  type StoredFile,
} from "@/lib/db";
import { errorMessage, GatewayError } from "@/lib/errors";
import { classifyMimeType, emptyTypeUsage } from "@/lib/files/mime";
import {
  getFolderById,
  getFolderPath,
} from "@/lib/folders/service";
import {
  getAuthorizedClient,
} from "@/lib/google/client";
import {
  downloadFileStream,
  removeFile,
  restoreFile,
  trashFile,
  uploadFromPath,
} from "@/lib/google/drive";
import { syncAccountQuota } from "@/lib/google/quota";
import { rankAccounts } from "@/lib/google/selection";
import {
  adjustTypeUsage,
  syncAccountTypeUsage,
  TYPE_USAGE_STALE_MS,
} from "@/lib/google/usage";

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
}

function isWebStream(
  data: UploadDataSource,
): data is ReadableStream<Uint8Array> {
  return typeof (data as ReadableStream<Uint8Array>).getReader === "function";
}

async function writeTempFile(data: UploadDataSource): Promise<string> {
  const tempPath = path.join(
    os.tmpdir(),
    `gdrive-gateway-${crypto.randomUUID()}`,
  );
  const nodeStream = isWebStream(data)
    ? Readable.fromWeb(data as unknown as NodeReadableStream)
    : Readable.from(data);

  await pipeline(nodeStream, createWriteStream(tempPath));

  return tempPath;
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
  const tempPath = await writeTempFile(input.data);

  try {
    return await uploadTempFile({
      tempPath,
      name: input.name,
      mimeType: input.mimeType,
      path: input.path,
      folderId: input.folderId ?? null,
      size: input.size,
      apiKeyId: input.apiKeyId ?? null,
    });
  } finally {
    await rm(tempPath, { force: true }).catch(() => undefined);
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

  let accounts = db.select().from(googleAccounts).all();
  await refreshStaleQuotas(accounts);
  accounts = db.select().from(googleAccounts).all();

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
      const auth = await getAuthorizedClient(account);
      const uploaded = await uploadFromPath({
        auth,
        filePath: input.tempPath,
        name: input.name,
        mimeType: input.mimeType,
      });

      if (!uploaded.id) {
        throw new Error("Google Drive did not return a file id");
      }

      const now = Date.now();
      const id = crypto.randomUUID();

      db.insert(files)
        .values({
          id,
          accountId: account.id,
          folderId,
          driveFileId: uploaded.id,
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
): Promise<{ file: StoredFile; account: GoogleAccount; response: Awaited<ReturnType<typeof downloadFileStream>> }> {
  const file = getFileById(id);
  const account = getAccountById(file.accountId);
  const auth = await getAuthorizedClient(account);
  const response = await downloadFileStream({
    auth,
    driveFileId: file.driveFileId,
    range,
  });

  recordActivity({
    action: "download",
    fileId: file.id,
    accountId: account.id,
    bytes: file.size,
    status: "ok",
  });

  return { file, account, response };
}

export async function trashFileById(
  id: string,
  apiKeyId?: string | null,
): Promise<StoredFile> {
  const db = getDb();
  const file = db.select().from(files).where(eq(files.id, id)).get();

  if (!file || file.status === "trashed") {
    throw new GatewayError("not_found", "File not found", 404);
  }

  const account = db
    .select()
    .from(googleAccounts)
    .where(eq(googleAccounts.id, file.accountId))
    .get();

  if (account && account.status !== "disconnected") {
    const auth = await getAuthorizedClient(account);

    try {
      await trashFile({ auth, driveFileId: file.driveFileId });
    } catch (error) {
      const message = errorMessage(error);

      if (!/not found|404/i.test(message)) {
        throw error;
      }
    }
  }

  const now = Date.now();

  db.update(files)
    .set({ status: "trashed", updatedAt: now })
    .where(eq(files.id, id))
    .run();

  adjustTypeUsage(file.accountId, file.mimeType, -file.size, -1);

  recordActivity({
    action: "trash",
    fileId: id,
    accountId: file.accountId,
    apiKeyId: apiKeyId ?? null,
    bytes: file.size,
    status: "ok",
  });

  return { ...file, status: "trashed", updatedAt: now };
}

export async function restoreFileById(id: string): Promise<StoredFile> {
  const db = getDb();
  const file = getFileById(id, { includeTrashed: true });

  if (file.status !== "trashed") {
    throw new GatewayError(
      "not_trashed",
      "File is not in the trash",
      409,
    );
  }

  const account = db
    .select()
    .from(googleAccounts)
    .where(eq(googleAccounts.id, file.accountId))
    .get();

  if (account && account.status !== "disconnected") {
    const auth = await getAuthorizedClient(account);
    await restoreFile({ auth, driveFileId: file.driveFileId });
  }

  const now = Date.now();

  db.update(files)
    .set({ status: "active", updatedAt: now })
    .where(eq(files.id, id))
    .run();

  adjustTypeUsage(file.accountId, file.mimeType, file.size, 1);

  recordActivity({
    action: "restore",
    fileId: id,
    accountId: file.accountId,
    bytes: file.size,
    status: "ok",
  });

  return { ...file, status: "active", updatedAt: now };
}

export async function deleteFilePermanentlyById(
  id: string,
): Promise<void> {
  const db = getDb();
  const file = getFileById(id, { includeTrashed: true });

  if (file.status !== "trashed") {
    throw new GatewayError(
      "not_trashed",
      "Move the file to trash before deleting it permanently",
      409,
    );
  }

  const account = db
    .select()
    .from(googleAccounts)
    .where(eq(googleAccounts.id, file.accountId))
    .get();

  if (account && account.status !== "disconnected") {
    const auth = await getAuthorizedClient(account);

    try {
      await removeFile({ auth, driveFileId: file.driveFileId });
    } catch (error) {
      const message = errorMessage(error);

      if (!/not found|404/i.test(message)) {
        throw error;
      }
    }
  }

  db.delete(files).where(eq(files.id, id)).run();

  recordActivity({
    action: "purge",
    fileId: id,
    accountId: file.accountId,
    bytes: file.size,
    status: "ok",
  });
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
      email: account.email,
      displayName: account.displayName,
      status: account.status,
      quotaLimit: account.quotaLimit,
      quotaUsage: account.quotaUsage,
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

  const cachedRows = db.select().from(typeUsage).all();
  const cachedByAccount = new Map(
    cachedRows.map((row) => [row.accountId, row]),
  );
  const now = Date.now();
  const staleAccounts = accounts.filter((account) => {
    const cached = cachedByAccount.get(account.id);

    return !cached || now - cached.syncedAt > TYPE_USAGE_STALE_MS;
  });

  if (staleAccounts.length > 0) {
    await Promise.allSettled(
      staleAccounts.map((account) => syncAccountTypeUsage(account)),
    );
  }

  const freshRows = db.select().from(typeUsage).all();
  const accountIds = new Set(accounts.map((account) => account.id));
  const breakdown = emptyTypeUsage();
  let hasCachedTotals = false;

  for (const row of freshRows) {
    if (!accountIds.has(row.accountId)) {
      continue;
    }

    hasCachedTotals = true;
    breakdown.photos.bytes += row.photosBytes;
    breakdown.photos.count += row.photosCount;
    breakdown.videos.bytes += row.videosBytes;
    breakdown.videos.count += row.videosCount;
    breakdown.documents.bytes += row.documentsBytes;
    breakdown.documents.count += row.documentsCount;
    breakdown.other.bytes += row.otherBytes;
    breakdown.other.count += row.otherCount;
  }

  const indexedRows = db
    .select({ mimeType: files.mimeType, size: files.size })
    .from(files)
    .where(eq(files.status, "active"))
    .all();

  let indexedBytes = 0;

  for (const row of indexedRows) {
    indexedBytes += row.size;
  }

  if (!hasCachedTotals) {
    for (const row of indexedRows) {
      const category = classifyMimeType(row.mimeType);
      breakdown[category].bytes += row.size;
      breakdown[category].count += 1;
    }
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
