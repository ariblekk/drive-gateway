import crypto from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";

import { decrypt, encrypt } from "@/lib/crypto";
import {
  files,
  getDb,
  s3Credentials,
  type S3Credential,
} from "@/lib/db";

export type CreateS3CredentialInput = {
  name: string;
  bucketId?: string;
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
    bucketId: input.bucketId?.trim() || "*",
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

export function revokeS3Credential(
  id: string,
): S3Credential | null {
  const existing = getS3CredentialById(id);

  if (!existing) {
    return null;
  }

  getDb()
    .update(s3Credentials)
    .set({ status: "revoked" })
    .where(eq(s3Credentials.id, id))
    .run();

  return getS3CredentialById(id);
}
