import crypto from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";

import { decrypt, encrypt } from "@/lib/crypto";
import {
  buckets,
  files,
  getDb,
  s3Credentials,
  type S3Credential,
} from "@/lib/db";

export type CreateS3CredentialInput = {
  name: string;
  bucketId: string;
  permission?: "read-write" | "read-only";
  maxStorageBytes?: number | null;
};

export type S3CredentialWithUsage = S3Credential & {
  usedStorageBytes: number;
};

export function getCredentialUsage(
  credential: S3Credential,
): number {
  const db = getDb();

  if (credential.bucketId !== "*") {
    const row = db
      .select({
        total: sql<number>`coalesce(sum(${files.size}), 0)`,
      })
      .from(files)
      .where(
        and(
          eq(files.bucketId, credential.bucketId),
          eq(files.status, "active"),
        ),
      )
      .get();

    return Number(row?.total ?? 0);
  }

  const row = db
    .select({
      total: sql<number>`coalesce(sum(${files.size}), 0)`,
    })
    .from(files)
    .where(
      and(
        eq(files.s3CredentialId, credential.id),
        eq(files.status, "active"),
      ),
    )
    .get();

  return Number(row?.total ?? 0);
}

export function createS3Credential(
  input: CreateS3CredentialInput,
): {
  credential: S3Credential;
  secretAccessKey: string;
} {
  const name = input.name.trim();

  if (!name) {
    throw new Error("Credential name is required");
  }

  const bucketId = input.bucketId.trim();

  if (!bucketId || bucketId === "*") {
    throw new Error("A specific bucket must be selected for this S3 credential");
  }
  if (!getDb().select().from(buckets).where(eq(buckets.name, bucketId)).get()) {
    throw new Error("The selected bucket does not exist");
  }

  const id = crypto.randomUUID();
  const accessKeyId = `s3_${crypto
    .randomBytes(18)
    .toString("base64url")}`;
  const secretAccessKey = crypto
    .randomBytes(32)
    .toString("base64url");
  const now = Date.now();

  const credential: S3Credential = {
    id,
    name,
    accessKeyId,
    secretCiphertext: encrypt(secretAccessKey),
    bucketId,
    permission:
      input.permission === "read-only"
        ? "read-only"
        : "read-write",
    maxStorageBytes:
      typeof input.maxStorageBytes === "number" &&
      input.maxStorageBytes > 0
        ? Math.floor(input.maxStorageBytes)
        : null,
    status: "active",
    lastUsedAt: null,
    createdAt: now,
  };

  getDb().insert(s3Credentials).values(credential).run();

  return { credential, secretAccessKey };
}

export function listS3Credentials(): S3CredentialWithUsage[] {
  const list = getDb()
    .select()
    .from(s3Credentials)
    .orderBy(desc(s3Credentials.createdAt))
    .all();

  return list.map((cred) => ({
    ...cred,
    usedStorageBytes: getCredentialUsage(cred),
  }));
}

export function getS3CredentialById(
  id: string,
): S3Credential | null {
  return (
    getDb()
      .select()
      .from(s3Credentials)
      .where(eq(s3Credentials.id, id))
      .get() ?? null
  );
}

export function findS3Credential(
  accessKeyId: string,
): S3Credential | null {
  return (
    getDb()
      .select()
      .from(s3Credentials)
      .where(
        and(
          eq(s3Credentials.accessKeyId, accessKeyId),
          eq(s3Credentials.status, "active"),
        ),
      )
      .get() ?? null
  );
}

export function decryptS3Secret(
  credential: S3Credential,
): string {
  return decrypt(credential.secretCiphertext);
}

export function touchS3Credential(id: string): void {
  getDb()
    .update(s3Credentials)
    .set({ lastUsedAt: Date.now() })
    .where(eq(s3Credentials.id, id))
    .run();
}

export function updateS3Credential(
  id: string,
  input: CreateS3CredentialInput,
): S3Credential | null {
  const existing = getS3CredentialById(id);
  if (!existing) return null;

  const name = input.name.trim();
  const bucketId = input.bucketId.trim();
  if (!name || !bucketId || bucketId === "*") {
    throw new Error("Credential name and one specific bucket are required");
  }
  if (!getDb().select().from(buckets).where(eq(buckets.name, bucketId)).get()) {
    throw new Error("The selected bucket does not exist");
  }

  getDb()
    .update(s3Credentials)
    .set({
      name,
      bucketId,
      permission: input.permission === "read-only" ? "read-only" : "read-write",
      maxStorageBytes:
        typeof input.maxStorageBytes === "number" && input.maxStorageBytes > 0
          ? Math.floor(input.maxStorageBytes)
          : null,
    })
    .where(eq(s3Credentials.id, id))
    .run();

  return getS3CredentialById(id);
}

export function deleteS3Credential(
  id: string,
): S3Credential | null {
  const existing = getS3CredentialById(id);

  if (!existing) {
    return null;
  }

  getDb()
    .delete(s3Credentials)
    .where(eq(s3Credentials.id, id))
    .run();

  return existing;
}
