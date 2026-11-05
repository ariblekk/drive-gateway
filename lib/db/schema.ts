import {
  index,
  integer,
  sqliteTable,
  text,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

export const storageAccounts = sqliteTable(
  "storage_accounts",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull().default("google"),
    email: text("email").notNull().unique(),
    displayName: text("display_name"),
    pictureUrl: text("picture_url"),
    refreshToken: text("refresh_token").notNull().default(""),
    accessToken: text("access_token"),
    tokenExpiry: integer("token_expiry"),
    scope: text("scope"),
    s3Endpoint: text("s3_endpoint"),
    s3Bucket: text("s3_bucket"),
    s3Region: text("s3_region").default("us-east-1"),
    s3AccessKeyId: text("s3_access_key_id"),
    s3SecretCiphertext: text("s3_secret_ciphertext"),
    s3ForcePathStyle: integer("s3_force_path_style").default(1),
    quotaLimit: integer("quota_limit"),
    quotaUsage: integer("quota_usage").notNull().default(0),
    quotaUsageInDrive: integer("quota_usage_in_drive").notNull().default(0),
    status: text("status").notNull().default("active"),
    lastError: text("last_error"),
    lastUsedAt: integer("last_used_at"),
    lastQuotaSync: integer("last_quota_sync"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("storage_accounts_status_idx").on(table.status),
    index("storage_accounts_provider_idx").on(table.provider),
  ],
);

export const googleAccounts = storageAccounts;

export const typeUsage = sqliteTable("type_usage", {
  accountId: text("account_id")
    .primaryKey()
    .references(() => storageAccounts.id),
  photosBytes: integer("photos_bytes").notNull().default(0),
  photosCount: integer("photos_count").notNull().default(0),
  videosBytes: integer("videos_bytes").notNull().default(0),
  videosCount: integer("videos_count").notNull().default(0),
  documentsBytes: integer("documents_bytes").notNull().default(0),
  documentsCount: integer("documents_count").notNull().default(0),
  otherBytes: integer("other_bytes").notNull().default(0),
  otherCount: integer("other_count").notNull().default(0),
  syncedAt: integer("synced_at").notNull().default(0),
});

export const folders = sqliteTable(
  "folders",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    parentId: text("parent_id").references(
      (): AnySQLiteColumn => folders.id,
    ),
    bucketId: text("bucket_id").notNull().default("default"),
    status: text("status").notNull().default("active"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("folders_parent_id_idx").on(table.parentId),
    index("folders_status_idx").on(table.status),
    index("folders_bucket_parent_idx").on(table.bucketId, table.parentId),
  ],
);

export const buckets = sqliteTable("buckets", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: integer("created_at").notNull(),
});

export const s3Credentials = sqliteTable("s3_credentials", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  accessKeyId: text("access_key_id").notNull().unique(),
  secretCiphertext: text("secret_ciphertext").notNull(),
  bucketId: text("bucket_id").notNull().default("*"),
  permission: text("permission").notNull().default("read-write"),
  maxStorageBytes: integer("max_storage_bytes"),
  status: text("status").notNull().default("active"),
  lastUsedAt: integer("last_used_at"),
  createdAt: integer("created_at").notNull(),
});

export const files = sqliteTable(
  "files",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => storageAccounts.id),
    folderId: text("folder_id").references(() => folders.id),
    driveFileId: text("drive_file_id").notNull(),
    bucketId: text("bucket_id").notNull().default("default"),
    key: text("key").notNull().default(""),
    etag: text("etag"),
    metadata: text("metadata"),
    s3CredentialId: text("s3_credential_id"),
    name: text("name").notNull(),
    mimeType: text("mime_type"),
    size: integer("size").notNull(),
    path: text("path").notNull().default("/"),
    status: text("status").notNull().default("active"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("files_account_id_idx").on(table.accountId),
    index("files_folder_id_idx").on(table.folderId),
    index("files_status_idx").on(table.status),
    index("files_bucket_key_idx").on(table.bucketId, table.key),
    index("files_bucket_key_status_idx").on(
      table.bucketId,
      table.key,
      table.status,
    ),
    index("files_s3_cred_idx").on(table.s3CredentialId, table.status),
  ],
);

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  keyPrefix: text("key_prefix").notNull(),
  lastUsedAt: integer("last_used_at"),
  revokedAt: integer("revoked_at"),
  createdAt: integer("created_at").notNull(),
});

export const activityLog = sqliteTable(
  "activity_log",
  {
    id: text("id").primaryKey(),
    action: text("action").notNull(),
    fileId: text("file_id"),
    accountId: text("account_id"),
    apiKeyId: text("api_key_id"),
    bytes: integer("bytes"),
    status: text("status").notNull().default("ok"),
    message: text("message"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("activity_log_created_at_idx").on(table.createdAt)],
);

export type StorageAccount = typeof storageAccounts.$inferSelect;
export type NewStorageAccount = typeof storageAccounts.$inferInsert;

export type GoogleAccount = StorageAccount;
export type NewGoogleAccount = NewStorageAccount;

export type TypeUsage = typeof typeUsage.$inferSelect;
export type NewTypeUsage = typeof typeUsage.$inferInsert;

export type Folder = typeof folders.$inferSelect;
export type NewFolder = typeof folders.$inferInsert;

export type Bucket = typeof buckets.$inferSelect;
export type NewBucket = typeof buckets.$inferInsert;

export type S3Credential = typeof s3Credentials.$inferSelect;
export type NewS3Credential = typeof s3Credentials.$inferInsert;

export type StoredFile = typeof files.$inferSelect;
export type NewStoredFile = typeof files.$inferInsert;

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

export type ActivityEntry = typeof activityLog.$inferSelect;
export type NewActivityEntry = typeof activityLog.$inferInsert;
