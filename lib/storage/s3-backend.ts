import fs from "node:fs";
import { Readable } from "node:stream";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { and, eq, sql } from "drizzle-orm";

import { decrypt } from "@/lib/crypto";
import {
  files,
  getDb,
  googleAccounts,
  type GoogleAccount,
} from "@/lib/db";
import {
  assertSafeHttpUrl,
  assertSafeS3Endpoint,
} from "@/lib/security/outbound-url";

export function createS3BackendClient(account: GoogleAccount): {
  client: S3Client;
  bucket: string;
} {
  if (
    !account.s3Endpoint ||
    !account.s3Bucket ||
    !account.s3AccessKeyId ||
    !account.s3SecretCiphertext
  ) {
    throw new Error(
      `Incomplete S3 backend configuration for account ${account.id}`,
    );
  }

  const secret = decrypt(account.s3SecretCiphertext);

  // Re-validate stored endpoints in case the row was created before the SSRF
  // guard existed or was edited directly in the database.
  assertSafeHttpUrl(account.s3Endpoint);

  const client = new S3Client({
    endpoint: account.s3Endpoint,
    region: account.s3Region || "us-east-1",
    credentials: {
      accessKeyId: account.s3AccessKeyId,
      secretAccessKey: secret,
    },
    forcePathStyle: Boolean(account.s3ForcePathStyle ?? 1),
  });

  return { client, bucket: account.s3Bucket };
}

export async function testS3BackendConnection(config: {
  endpoint: string;
  bucket: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}): Promise<void> {
  const safeEndpoint = await assertSafeS3Endpoint(config.endpoint);
  const endpoint =
    safeEndpoint.pathname === "/" && !safeEndpoint.search
      ? safeEndpoint.origin
      : safeEndpoint.toString();

  const client = new S3Client({
    endpoint,
    region: config.region || "us-east-1",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.forcePathStyle ?? true,
  });

  await client.send(
    new HeadBucketCommand({ Bucket: config.bucket }),
  );
}

export async function uploadToS3Backend(
  account: GoogleAccount,
  input: {
    filePath: string;
    name: string;
    mimeType: string;
    fileId: string;
    md5?: string;
  },
): Promise<{ remoteId: string; md5Checksum?: string }> {
  const { client, bucket } = createS3BackendClient(account);
  const remoteKey = `gateway/${input.fileId}/${input.name}`;
  const fileStream = fs.createReadStream(input.filePath);

  const res = await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: remoteKey,
      Body: fileStream,
      ContentType: input.mimeType,
      Metadata: {
        "gateway-file-id": input.fileId,
        "gateway-original-name": encodeURIComponent(input.name),
      },
    }),
  );

  const md5Checksum = res.ETag
    ? res.ETag.replace(/^"+|"+$/g, "")
    : input.md5;

  return { remoteId: remoteKey, md5Checksum };
}

export async function downloadFromS3Backend(
  account: GoogleAccount,
  remoteKey: string,
  range?: string | null,
): Promise<{
  data: Readable;
  status: number;
  headers: Record<string, string>;
}> {
  const { client, bucket } = createS3BackendClient(account);

  const res = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: remoteKey,
      Range: range || undefined,
    }),
  );

  const stream = res.Body as unknown as Readable;
  const headers: Record<string, string> = {};

  if (res.ContentType) {
    headers["content-type"] = res.ContentType;
  }
  if (res.ContentLength !== undefined) {
    headers["content-length"] = String(res.ContentLength);
  }
  if (res.ContentRange) {
    headers["content-range"] = res.ContentRange;
  }
  if (res.ETag) {
    headers["etag"] = res.ETag;
  }

  const status = range && res.ContentRange ? 206 : 200;

  return { data: stream, status, headers };
}

export async function deleteFromS3Backend(
  account: GoogleAccount,
  remoteKey: string,
): Promise<void> {
  const { client, bucket } = createS3BackendClient(account);

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: remoteKey,
    }),
  );
}

export async function syncS3BackendQuota(
  account: GoogleAccount,
): Promise<GoogleAccount> {
  const db = getDb();
  const row = db
    .select({
      total: sql<number>`coalesce(sum(${files.size}), 0)`,
    })
    .from(files)
    .where(
      and(
        eq(files.accountId, account.id),
        eq(files.status, "active"),
      ),
    )
    .get();

  const usage = Number(row?.total ?? 0);
  const now = Date.now();

  db.update(googleAccounts)
    .set({
      quotaUsage: usage,
      lastQuotaSync: now,
      updatedAt: now,
    })
    .where(eq(googleAccounts.id, account.id))
    .run();

  const updated = db
    .select()
    .from(googleAccounts)
    .where(eq(googleAccounts.id, account.id))
    .get();

  return updated ?? account;
}
