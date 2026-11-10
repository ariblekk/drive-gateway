import type {
  ActivityEntry,
  GoogleAccount,
  S3Credential,
  StoredFile,
} from "@/lib/db";

export function publicAccount(account: GoogleAccount) {
  return {
    id: account.id,
    provider: account.provider,
    email: account.email,
    displayName: account.displayName,
    pictureUrl: account.pictureUrl,
    s3Endpoint: account.s3Endpoint,
    s3Bucket: account.s3Bucket,
    s3Region: account.s3Region,
    status: account.status,
    quotaLimit: account.quotaLimit,
    quotaUsage: account.quotaUsage,
    quotaUsageInDrive: account.quotaUsageInDrive,
    lastError: account.lastError,
    lastUsedAt: account.lastUsedAt,
    lastQuotaSync: account.lastQuotaSync,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

export type PublicAccount = ReturnType<typeof publicAccount>;

export function publicFile(file: StoredFile) {
  return {
    id: file.id,
    accountId: file.accountId,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    path: file.path,
    bucketId: file.bucketId,
    key: file.key,
    status: file.status,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  };
}

export type PublicFile = ReturnType<typeof publicFile>;

export function publicS3Credential(
  credential: S3Credential & { usedStorageBytes?: number },
) {
  return {
    id: credential.id,
    name: credential.name,
    accessKeyId: credential.accessKeyId,
    bucketId: credential.bucketId,
    permission: credential.permission,
    maxStorageBytes: credential.maxStorageBytes,
    usedStorageBytes: credential.usedStorageBytes,
    status: credential.status,
    lastUsedAt: credential.lastUsedAt,
    createdAt: credential.createdAt,
  };
}

export type PublicS3Credential = ReturnType<typeof publicS3Credential>;

export function publicActivity(entry: ActivityEntry) {
  return {
    id: entry.id,
    action: entry.action,
    fileId: entry.fileId,
    accountId: entry.accountId,
    bytes: entry.bytes,
    status: entry.status,
    message: entry.message,
    createdAt: entry.createdAt,
  };
}

export type PublicActivity = ReturnType<typeof publicActivity>;
