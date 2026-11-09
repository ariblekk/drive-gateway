import type { Readable } from "node:stream";

import { eq } from "drizzle-orm";

import { getDb, googleAccounts, type GoogleAccount } from "@/lib/db";
import { getAuthorizedClient, createDriveClient } from "@/lib/google/client";
import {
  downloadFileStream,
  getFileChecksum,
  removeFile,
  uploadFromPath,
} from "@/lib/google/drive";
import {
  deleteFromS3Backend,
  downloadFromS3Backend,
  syncS3BackendQuota,
  uploadToS3Backend,
} from "@/lib/storage/s3-backend";

// Single funnel for provider-specific storage operations. Still an if/else
// under the hood, but every call site now has one place to change when a
// third provider lands. ponytail: add a provider registry only when a third
// backend actually exists and the contract is proven.

export type BackendDownload = {
  data: Readable;
  status: number;
  headers: Record<string, string>;
};

export async function uploadToBackend(
  account: GoogleAccount,
  input: {
    filePath: string;
    name: string;
    mimeType: string;
    fileId: string;
    md5?: string;
  },
): Promise<{ remoteId: string; md5Checksum?: string | null }> {
  if (account.provider === "s3") {
    return uploadToS3Backend(account, input);
  }

  const auth = await getAuthorizedClient(account);
  const uploaded = await uploadFromPath({
    auth,
    filePath: input.filePath,
    name: input.name,
    mimeType: input.mimeType,
  });

  if (!uploaded.id) {
    throw new Error("Google Drive did not return a file id");
  }

  return {
    remoteId: uploaded.id,
    md5Checksum: uploaded.md5Checksum ?? null,
  };
}

export async function downloadFromBackend(
  account: GoogleAccount,
  remoteId: string,
  range?: string | null,
): Promise<BackendDownload> {
  if (account.provider === "s3") {
    return downloadFromS3Backend(account, remoteId, range);
  }

  const auth = await getAuthorizedClient(account);
  const driveRes = await downloadFileStream({
    auth,
    driveFileId: remoteId,
    range,
  });

  return {
    data: driveRes.data as unknown as Readable,
    status: driveRes.status,
    headers: (driveRes.headers ?? {}) as Record<string, string>,
  };
}

export async function deleteFromBackend(
  account: GoogleAccount,
  remoteId: string,
): Promise<void> {
  if (account.provider === "s3") {
    await deleteFromS3Backend(account, remoteId);
    return;
  }

  const auth = await getAuthorizedClient(account);
  await removeFile({ auth, driveFileId: remoteId });
}

export async function syncBackendQuota(
  account: GoogleAccount,
): Promise<GoogleAccount> {
  if (account.provider === "s3") {
    return syncS3BackendQuota(account);
  }

  const auth = await getAuthorizedClient(account);
  const drive = createDriveClient(auth);
  const { data } = await drive.about.get({ fields: "storageQuota" });
  const quota = data.storageQuota;
  const quotaLimit = quota?.limit ? Number(quota.limit) : null;
  const quotaUsage = quota?.usage ? Number(quota.usage) : 0;
  const quotaUsageInDrive = quota?.usageInDrive
    ? Number(quota.usageInDrive)
    : 0;
  const now = Date.now();

  getDb().update(googleAccounts)
    .set({
      quotaLimit,
      quotaUsage,
      quotaUsageInDrive,
      lastQuotaSync: now,
      status: "active",
      lastError: null,
      updatedAt: now,
    })
    .where(eq(googleAccounts.id, account.id))
    .run();

  return {
    ...account,
    quotaLimit,
    quotaUsage,
    quotaUsageInDrive,
    lastQuotaSync: now,
    status: "active",
    lastError: null,
    updatedAt: now,
  };
}

export async function getBackendChecksum(
  account: GoogleAccount,
  remoteId: string,
): Promise<{ md5Checksum?: string | null } | null> {
  if (account.provider === "s3") {
    // S3 ETags are already stored as the row etag at upload time.
    return null;
  }

  const auth = await getAuthorizedClient(account);
  return getFileChecksum({ auth, driveFileId: remoteId });
}
