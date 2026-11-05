import { and, eq } from "drizzle-orm";

import {
  buckets,
  files,
  getDb,
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
    createdAt: Date.now(),
  };

  getDb().insert(buckets).values(bucket).run();

  return bucket;
}

export function createBucket(name: string): Bucket {
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

  if (!bucketIsEmpty(bucket.id)) {
    throw new S3Error(
      "BucketNotEmpty",
      "The bucket you tried to delete is not empty",
      409,
    );
  }

  getDb().delete(buckets).where(eq(buckets.id, bucket.id)).run();
}
