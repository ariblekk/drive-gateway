export interface RestoreResult {
  restored: {
    storageAccounts: number;
    typeUsage: number;
    folders: number;
    buckets: number;
    s3Credentials: number;
    files: number;
    apiKeys: number;
  };
}

export interface Account {
  id: string;
  provider: "google" | "s3";
  email: string;
  displayName: string | null;
  pictureUrl: string | null;
  s3Endpoint?: string | null;
  s3Bucket?: string | null;
  s3Region?: string | null;
  status: string;
  quotaLimit: number | null;
  quotaUsage: number;
  quotaUsageInDrive: number;
  lastError: string | null;
  lastUsedAt: number | null;
  lastQuotaSync: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface AccountStats {
  id: string;
  provider?: "google" | "s3";
  email: string;
  displayName: string | null;
  s3Endpoint?: string | null;
  s3Bucket?: string | null;
  status: string;
  quotaLimit: number | null;
  quotaUsage: number;
  projectUsageBytes: number;
  quotaUsageInDrive: number;
  lastQuotaSync: number | null;
  lastError: string | null;
  lastUsedAt: number | null;
}

export interface Stats {
  accounts: number;
  unlimitedAccounts: number;
  totalFiles: number;
  totalFileBytes: number;
  totalLimitBytes: number;
  totalUsedBytes: number;
  totalFreeBytes: number;
  perAccount: AccountStats[];
}

export interface FolderItem {
  id: string;
  name: string;
  parentId: string | null;
  status: string;
  path: string;
  createdAt: number;
  updatedAt: number;
}

export interface Breadcrumb {
  id: string;
  name: string;
  path: string;
}

export interface FileItem {
  id: string;
  accountId: string;
  name: string;
  mimeType: string | null;
  size: number;
  path: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  accountEmail?: string | null;
  bucketId?: string;
  key?: string;
}

export interface BucketItem {
  id: string;
  name: string;
  storageAccountId?: string | null;
  createdAt: number;
  objectCount: number;
  totalBytes: number;
}

export interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: number | null;
  revokedAt: number | null;
  createdAt: number;
}

export interface S3CredentialItem {
  id: string;
  name: string;
  accessKeyId: string;
  bucketId: string;
  permission: string;
  maxStorageBytes: number | null;
  usedStorageBytes?: number;
  status: string;
  lastUsedAt: number | null;
  createdAt: number;
}

export interface ActivityItem {
  id: string;
  action: string;
  fileId: string | null;
  accountId: string | null;
  apiKeyId: string | null;
  bytes: number | null;
  status: string;
  message: string | null;
  createdAt: number;
  accountEmail?: string | null;
}

export interface DailyTrafficItem {
  date: string;
  uploadBytes: number;
  downloadBytes: number;
}

export interface OverviewResponse {
  stats: Stats;
  recentActivity: ActivityItem[];
  traffic: DailyTrafficItem[];
}

export interface StorageCategory {
  bytes: number;
  count: number;
}

export interface StorageSummary {
  limitBytes: number;
  usedBytes: number;
  freeBytes: number;
  unlimitedAccounts: number;
  accounts: number;
  indexedBytes: number;
  indexedFiles: number;
  breakdown: {
    photos: StorageCategory;
    videos: StorageCategory;
    documents: StorageCategory;
    other: StorageCategory;
  };
}
