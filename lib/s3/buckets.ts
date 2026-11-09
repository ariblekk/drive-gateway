import { and, eq, or } from "drizzle-orm";

import {
  buckets,
  files,
  folders,
  getDb,
  s3Credentials,
  type Bucket,
} from "@/lib/db";

import { S3Error } from "./errors";
import { DEFAULT_BUCKET, isValidBucketName } from "./keys";

export function listBuckets(): Bucket[] {
  return getDb()
    .select()
    .from(buckets)
    .orderBy(buckets.name)
    .all();
}

export function getBucketByName(name: string): Bucket | null {
  return (
    getDb()
      .select()
      .from(buckets)
      .where(eq(buckets.name, name))
      .get() ?? null
  );
}

export function ensureDefaultBucket(): Bucket {
  const existing = getBucketByName(DEFAULT_BUCKET);

  if (existing) {
    return existing;
  }

  const bucket: Bucket = {
    id: DEFAULT_BUCKET,
    name: DEFAULT_BUCKET,
    storageAccountId: null,
    createdAt: Date.now(),
  };

  getDb().insert(buckets).values(bucket).run();

  return bucket;
}

export function createBucket(
  name: string,
  storageAccountId?: string | null,
): Bucket {
  if (!isValidBucketName(name)) {
    throw new S3Error(
      "InvalidBucketName",
      "The specified bucket is not valid",
      400,
    );
  }

  const existing = getBucketByName(name);

  if (existing) {
    return existing;
  }

  const bucket: Bucket = {
    id: name,
    name,
    storageAccountId: storageAccountId ?? null,
    createdAt: Date.now(),
  };

  getDb().insert(buckets).values(bucket).run();

  return bucket;
}

export function bucketIsEmpty(bucketId: string): boolean {
  const row = getDb()
    .select({ id: files.id })
    .from(files)
    .where(
      and(
        eq(files.bucketId, bucketId),
        eq(files.status, "active"),
      ),
    )
    .get();

  return !row;
}

export function deleteBucket(name: string): void {
  if (name === DEFAULT_BUCKET) {
    throw new S3Error(
      "InvalidRequest",
      "The default bucket cannot be deleted",
      400,
    );
  }

  const bucket = getBucketByName(name);

  if (!bucket) {
    throw new S3Error(
      "NoSuchBucket",
      "The specified bucket does not exist",
      404,
    );
  }

  const db = getDb();
  const activeCredential = db
    .select({ id: s3Credentials.id })
    .from(s3Credentials)
    .where(
      and(
        eq(s3Credentials.status, "active"),
        or(
          eq(s3Credentials.bucketId, bucket.id),
          eq(s3Credentials.bucketId, "*"),
        ),
      ),
    )
    .get();

  if (activeCredential) {
    throw new S3Error(
      "InvalidRequest",
      "Disable or remove active S3 credentials connected to this bucket before deleting it",
      409,
    );
  }

  const bucketContent = db
    .select({ id: files.id })
    .from(files)
    .where(eq(files.bucketId, bucket.name))
    .get();
  const bucketFolders = db
    .select({ id: folders.id })
    .from(folders)
    .where(eq(folders.bucketId, bucket.name))
    .get();

  if (bucketContent || bucketFolders) {
    throw new S3Error(
      "BucketNotEmpty",
      "Empty the bucket, including its folders, before deleting it",
      409,
    );
  }

  db.delete(buckets).where(eq(buckets.id, bucket.id)).run();
}
