import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { decrypt } from "@/lib/crypto";
import {
  apiKeys,
  buckets,
  files,
  folders,
  getDb,
  loginAttempts,
  s3Credentials,
  storageAccounts,
  typeUsage,
} from "@/lib/db";
import { GatewayError } from "@/lib/errors";

export const BACKUP_TYPE = "drive-gateway-backup";
export const BACKUP_VERSION = 2;

const LEGACY_BACKUP_TYPE = "drive-gateway-credentials";
const LEGACY_BACKUP_VERSION = 1;

const storageAccountSchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  email: z.string().min(1),
  displayName: z.string().nullable(),
  pictureUrl: z.string().nullable(),
  refreshToken: z.string(),
  accessToken: z.string().nullable(),
  tokenExpiry: z.number().int().nullable(),
  scope: z.string().nullable(),
  s3Endpoint: z.string().nullable(),
  s3Bucket: z.string().nullable(),
  s3Region: z.string().nullable(),
  s3AccessKeyId: z.string().nullable(),
  s3SecretCiphertext: z.string().nullable(),
  s3ForcePathStyle: z.number().int().nullable(),
  quotaLimit: z.number().int().nullable(),
  quotaUsage: z.number().int(),
  quotaUsageInDrive: z.number().int(),
  status: z.string().min(1),
  lastError: z.string().nullable(),
  lastUsedAt: z.number().int().nullable(),
  lastQuotaSync: z.number().int().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

const typeUsageSchema = z.object({
  accountId: z.string().min(1),
  photosBytes: z.number().int(),
  photosCount: z.number().int(),
  videosBytes: z.number().int(),
  videosCount: z.number().int(),
  documentsBytes: z.number().int(),
  documentsCount: z.number().int(),
  otherBytes: z.number().int(),
  otherCount: z.number().int(),
  syncedAt: z.number().int(),
});

const folderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  parentId: z.string().nullable(),
  bucketId: z.string().min(1),
  status: z.string().min(1),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

const bucketSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  storageAccountId: z.string().nullable().optional(),
  createdAt: z.number().int(),
});

const s3CredentialSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  accessKeyId: z.string().min(1),
  secretCiphertext: z.string().min(1),
  bucketId: z.string().min(1),
  permission: z.string().min(1),
  maxStorageBytes: z.number().int().nullable(),
  status: z.string().min(1),
  lastUsedAt: z.number().int().nullable(),
  createdAt: z.number().int(),
});

const fileSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  folderId: z.string().nullable(),
  driveFileId: z.string(),
  bucketId: z.string().min(1),
  key: z.string(),
  etag: z.string().nullable(),
  metadata: z.string().nullable(),
  s3CredentialId: z.string().nullable(),
  name: z.string().min(1),
  mimeType: z.string().nullable(),
  size: z.number().int(),
  path: z.string(),
  status: z.string().min(1),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

const loginAttemptSchema = z.object({
  id: z.string().min(1),
  ip: z.string().min(1),
  email: z.string().min(1),
  createdAt: z.number().int(),
});

const apiKeySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  keyHash: z.string().min(1),
  keyPrefix: z.string().min(1),
  lastUsedAt: z.number().int().nullable(),
  revokedAt: z.number().int().nullable(),
  createdAt: z.number().int(),
});

const backupSchema = z.object({
  type: z.literal(BACKUP_TYPE),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string().optional(),
  data: z.object({
    storageAccounts: z.array(storageAccountSchema).default([]),
    typeUsage: z.array(typeUsageSchema).default([]),
    folders: z.array(folderSchema).default([]),
    buckets: z.array(bucketSchema).default([]),
    s3Credentials: z.array(s3CredentialSchema).default([]),
    files: z.array(fileSchema).default([]),
    apiKeys: z.array(apiKeySchema).default([]),
    loginAttempts: z.array(loginAttemptSchema).default([]),
  }),
});

const legacyBackupSchema = z.object({
  type: z.literal(LEGACY_BACKUP_TYPE),
  version: z.literal(LEGACY_BACKUP_VERSION),
  data: z.object({
    storageAccounts: z.array(storageAccountSchema),
    apiKeys: z.array(apiKeySchema),
    s3Credentials: z.array(s3CredentialSchema),
  }),
});

type BackupData = z.infer<typeof backupSchema>["data"];

export interface BackupCounts {
  storageAccounts: number;
  typeUsage: number;
  folders: number;
  buckets: number;
  s3Credentials: number;
  files: number;
  apiKeys: number;
  loginAttempts: number;
}

export interface GatewayBackup {
  type: typeof BACKUP_TYPE;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  counts: BackupCounts;
  data: BackupData;
}

export interface RestoreResult {
  restored: BackupCounts;
}

export function createBackup(): GatewayBackup {
  const db = getDb();
  const accounts = db.select().from(storageAccounts).all();
  const usage = db.select().from(typeUsage).all();
  const folderRows = db.select().from(folders).all();
  const bucketRows = db.select().from(buckets).all();
  const credentials = db.select().from(s3Credentials).all();
  const fileRows = db.select().from(files).all();
  const keys = db.select().from(apiKeys).all();
  const attempts = db.select().from(loginAttempts).all();

  return {
    type: BACKUP_TYPE,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    counts: {
      storageAccounts: accounts.length,
      typeUsage: usage.length,
      folders: folderRows.length,
      buckets: bucketRows.length,
      s3Credentials: credentials.length,
      files: fileRows.length,
      apiKeys: keys.length,
      loginAttempts: attempts.length,
    },
    data: {
      storageAccounts: accounts,
      typeUsage: usage,
      folders: folderRows,
      buckets: bucketRows,
      s3Credentials: credentials,
      files: fileRows,
      apiKeys: keys,
      loginAttempts: attempts,
    },
  };
}

function assertDecryptable(data: BackupData): void {
  for (const account of data.storageAccounts) {
    for (const value of [
      account.refreshToken,
      account.accessToken,
      account.s3SecretCiphertext,
    ]) {
      if (value) {
        assertCiphertext(value);
      }
    }
  }

  for (const credential of data.s3Credentials) {
    assertCiphertext(credential.secretCiphertext);
  }
}

function assertCiphertext(value: string): void {
  try {
    decrypt(value);
  } catch {
    throw new GatewayError(
      "invalid_backup",
      "This backup contains credentials encrypted with a different ENCRYPTION_KEY. Restore it on an instance that uses the same key.",
      400,
    );
  }
}

function parseBackup(input: unknown): BackupData {
  const parsed = backupSchema.safeParse(input);

  if (parsed.success) {
    return parsed.data.data;
  }

  const legacy = legacyBackupSchema.safeParse(input);

  if (legacy.success) {
    return {
      storageAccounts: legacy.data.data.storageAccounts,
      apiKeys: legacy.data.data.apiKeys,
      s3Credentials: legacy.data.data.s3Credentials,
      typeUsage: [],
      folders: [],
      buckets: [],
      files: [],
      loginAttempts: [],
    };
  }

  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "backup"}: ${issue.message}`)
    .join("; ");

  throw new GatewayError(
    "invalid_backup",
    `Invalid backup file: ${details}`,
    400,
  );
}

export function restoreBackup(input: unknown): RestoreResult {
  const data = parseBackup(input);
  assertDecryptable(data);

  return getDb().transaction((tx) => {
    // Folders reference their parents, so defer FK checks until commit.
    tx.run(sql`PRAGMA defer_foreign_keys = ON`);

    const restored: BackupCounts = {
      storageAccounts: 0,
      typeUsage: 0,
      folders: 0,
      buckets: 0,
      s3Credentials: 0,
      files: 0,
      apiKeys: 0,
      loginAttempts: 0,
    };

    for (const bucket of data.buckets) {
      const existing =
        tx
          .select()
          .from(buckets)
          .where(eq(buckets.name, bucket.name))
          .get() ?? tx.select().from(buckets).where(eq(buckets.id, bucket.id)).get();

      if (existing) {
        tx.update(buckets)
          .set({ name: bucket.name })
          .where(eq(buckets.id, existing.id))
          .run();
      } else {
        tx.insert(buckets).values(bucket).run();
      }

      restored.buckets += 1;
    }

    const accountIdMap = new Map<string, string>();

    for (const account of data.storageAccounts) {
      const existing =
        tx
          .select()
          .from(storageAccounts)
          .where(eq(storageAccounts.email, account.email))
          .get() ??
        tx
          .select()
          .from(storageAccounts)
          .where(eq(storageAccounts.id, account.id))
          .get();

      if (existing) {
        tx.update(storageAccounts)
          .set({
            provider: account.provider,
            email: account.email,
            displayName: account.displayName,
            pictureUrl: account.pictureUrl,
            refreshToken: account.refreshToken,
            accessToken: account.accessToken,
            tokenExpiry: account.tokenExpiry,
            scope: account.scope,
            s3Endpoint: account.s3Endpoint,
            s3Bucket: account.s3Bucket,
            s3Region: account.s3Region,
            s3AccessKeyId: account.s3AccessKeyId,
            s3SecretCiphertext: account.s3SecretCiphertext,
            s3ForcePathStyle: account.s3ForcePathStyle,
            quotaLimit: account.quotaLimit,
            quotaUsage: account.quotaUsage,
            quotaUsageInDrive: account.quotaUsageInDrive,
            status: account.status,
            lastError: account.lastError,
            lastUsedAt: account.lastUsedAt,
            lastQuotaSync: account.lastQuotaSync,
            updatedAt: account.updatedAt,
          })
          .where(eq(storageAccounts.id, existing.id))
          .run();
        accountIdMap.set(account.id, existing.id);
      } else {
        tx.insert(storageAccounts).values(account).run();
        accountIdMap.set(account.id, account.id);
      }

      restored.storageAccounts += 1;
    }

    for (const folder of data.folders) {
      const existing = tx
        .select()
        .from(folders)
        .where(eq(folders.id, folder.id))
        .get();

      if (existing) {
        tx.update(folders)
          .set({
            name: folder.name,
            parentId: folder.parentId,
            bucketId: folder.bucketId,
            status: folder.status,
            updatedAt: folder.updatedAt,
          })
          .where(eq(folders.id, existing.id))
          .run();
      } else {
        tx.insert(folders).values(folder).run();
      }

      restored.folders += 1;
    }

    for (const credential of data.s3Credentials) {
      const existing =
        tx
          .select()
          .from(s3Credentials)
          .where(eq(s3Credentials.accessKeyId, credential.accessKeyId))
          .get() ??
        tx
          .select()
          .from(s3Credentials)
          .where(eq(s3Credentials.id, credential.id))
          .get();

      if (existing) {
        tx.update(s3Credentials)
          .set({
            name: credential.name,
            accessKeyId: credential.accessKeyId,
            secretCiphertext: credential.secretCiphertext,
            bucketId: credential.bucketId,
            permission: credential.permission,
            maxStorageBytes: credential.maxStorageBytes,
            status: credential.status,
            lastUsedAt: credential.lastUsedAt,
          })
          .where(eq(s3Credentials.id, existing.id))
          .run();
      } else {
        tx.insert(s3Credentials).values(credential).run();
      }

      restored.s3Credentials += 1;
    }

    for (const file of data.files) {
      const accountId = accountIdMap.get(file.accountId) ?? file.accountId;
      const existing = tx
        .select()
        .from(files)
        .where(eq(files.id, file.id))
        .get();

      if (existing) {
        tx.update(files)
          .set({
            accountId,
            folderId: file.folderId,
            driveFileId: file.driveFileId,
            bucketId: file.bucketId,
            key: file.key,
            etag: file.etag,
            metadata: file.metadata,
            s3CredentialId: file.s3CredentialId,
            name: file.name,
            mimeType: file.mimeType,
            size: file.size,
            path: file.path,
            status: file.status,
            updatedAt: file.updatedAt,
          })
          .where(eq(files.id, existing.id))
          .run();
      } else {
        tx.insert(files)
          .values({ ...file, accountId })
          .run();
      }

      restored.files += 1;
    }

    for (const usage of data.typeUsage) {
      const accountId = accountIdMap.get(usage.accountId) ?? usage.accountId;
      const existing = tx
        .select()
        .from(typeUsage)
        .where(eq(typeUsage.accountId, accountId))
        .get();

      if (existing) {
        tx.update(typeUsage)
          .set({
            photosBytes: usage.photosBytes,
            photosCount: usage.photosCount,
            videosBytes: usage.videosBytes,
            videosCount: usage.videosCount,
            documentsBytes: usage.documentsBytes,
            documentsCount: usage.documentsCount,
            otherBytes: usage.otherBytes,
            otherCount: usage.otherCount,
            syncedAt: usage.syncedAt,
          })
          .where(eq(typeUsage.accountId, accountId))
          .run();
      } else {
        tx.insert(typeUsage).values({ ...usage, accountId }).run();
      }

      restored.typeUsage += 1;
    }

    for (const key of data.apiKeys) {
      const existing =
        tx
          .select()
          .from(apiKeys)
          .where(eq(apiKeys.keyHash, key.keyHash))
          .get() ?? tx.select().from(apiKeys).where(eq(apiKeys.id, key.id)).get();

      if (existing) {
        tx.update(apiKeys)
          .set({
            name: key.name,
            keyHash: key.keyHash,
            keyPrefix: key.keyPrefix,
            lastUsedAt: key.lastUsedAt,
            revokedAt: key.revokedAt,
          })
          .where(eq(apiKeys.id, existing.id))
          .run();
      } else {
        tx.insert(apiKeys).values(key).run();
      }

      restored.apiKeys += 1;
    }

    for (const attempt of data.loginAttempts) {
      const existing = tx
        .select()
        .from(loginAttempts)
        .where(eq(loginAttempts.id, attempt.id))
        .get();

      if (existing) {
        tx.update(loginAttempts)
          .set(attempt)
          .where(eq(loginAttempts.id, attempt.id))
          .run();
      } else {
        tx.insert(loginAttempts).values(attempt).run();
      }

      restored.loginAttempts += 1;
    }

    return { restored };
  });
}
