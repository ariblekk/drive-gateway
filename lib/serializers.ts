import type {
  ActivityEntry,
  ApiKey,
  GoogleAccount,
  StoredFile,
} from "@/lib/db";

export function publicAccount(account: GoogleAccount) {
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    pictureUrl: account.pictureUrl,
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
    status: file.status,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  };
}

export type PublicFile = ReturnType<typeof publicFile>;

export function publicApiKey(key: ApiKey) {
  return {
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    lastUsedAt: key.lastUsedAt,
    revokedAt: key.revokedAt,
    createdAt: key.createdAt,
  };
}

export type PublicApiKey = ReturnType<typeof publicApiKey>;

export function publicActivity(entry: ActivityEntry) {
  return {
    id: entry.id,
    action: entry.action,
    fileId: entry.fileId,
    accountId: entry.accountId,
    apiKeyId: entry.apiKeyId,
    bytes: entry.bytes,
    status: entry.status,
    message: entry.message,
    createdAt: entry.createdAt,
  };
}

export type PublicActivity = ReturnType<typeof publicActivity>;
