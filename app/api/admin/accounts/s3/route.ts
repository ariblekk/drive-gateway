import crypto from "node:crypto";
import { connection } from "next/server";

import { handleRouteError, json } from "@/lib/api/response";
import { encrypt } from "@/lib/crypto";
import { getDb, googleAccounts } from "@/lib/db";
import { GatewayError } from "@/lib/errors";
import { publicAccount } from "@/lib/serializers";
import { assertSafeS3Endpoint } from "@/lib/security/outbound-url";
import { testS3BackendConnection } from "@/lib/storage/s3-backend";

export async function POST(request: Request) {
  try {
    await connection();
    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      endpoint?: unknown;
      bucket?: unknown;
      region?: unknown;
      accessKeyId?: unknown;
      secretAccessKey?: unknown;
      quotaLimit?: unknown;
      forcePathStyle?: unknown;
    } | null;

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const endpoint =
      typeof body?.endpoint === "string" ? body.endpoint.trim() : "";
    const bucket =
      typeof body?.bucket === "string" ? body.bucket.trim() : "";
    const region =
      typeof body?.region === "string" && body.region.trim()
        ? body.region.trim()
        : "us-east-1";
    const accessKeyId =
      typeof body?.accessKeyId === "string"
        ? body.accessKeyId.trim()
        : "";
    const secretAccessKey =
      typeof body?.secretAccessKey === "string"
        ? body.secretAccessKey.trim()
        : "";
    const quotaLimit =
      typeof body?.quotaLimit === "number" && body.quotaLimit > 0
        ? Math.floor(body.quotaLimit)
        : null;
    const forcePathStyle =
      body?.forcePathStyle !== undefined
        ? Boolean(body.forcePathStyle)
        : true;

    if (!name) {
      throw new GatewayError("bad_request", "Account name is required", 400);
    }
    if (!endpoint) {
      throw new GatewayError("bad_request", "Endpoint URL is required", 400);
    }
    if (!bucket) {
      throw new GatewayError("bad_request", "Bucket name is required", 400);
    }
    if (!accessKeyId || !secretAccessKey) {
      throw new GatewayError(
        "bad_request",
        "Access Key ID and Secret Access Key are required",
        400,
      );
    }

    let safeEndpoint: URL;

    try {
      safeEndpoint = await assertSafeS3Endpoint(endpoint);
    } catch (err: unknown) {
      throw new GatewayError(
        "bad_request",
        err instanceof Error ? err.message : "Invalid Endpoint URL",
        400,
      );
    }

    const endpointValue =
      safeEndpoint.pathname === "/" && !safeEndpoint.search
        ? safeEndpoint.origin
        : safeEndpoint.toString();

    // Test connection to external S3 backend before saving
    try {
      await testS3BackendConnection({
        endpoint: endpointValue,
        bucket,
        region,
        accessKeyId,
        secretAccessKey,
        forcePathStyle,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new GatewayError(
        "bad_request",
        `Failed to connect to S3 backend: ${msg}`,
        400,
      );
    }

    const id = crypto.randomUUID();
    const email = `s3-${id.slice(0, 8)}@${bucket}`;
    const now = Date.now();

    const newAccount = {
      id,
      provider: "s3",
      email,
      displayName: name,
      pictureUrl: null,
      refreshToken: "",
      accessToken: null,
      tokenExpiry: null,
      scope: null,
      s3Endpoint: endpointValue,
      s3Bucket: bucket,
      s3Region: region,
      s3AccessKeyId: accessKeyId,
      s3SecretCiphertext: encrypt(secretAccessKey),
      s3ForcePathStyle: forcePathStyle ? 1 : 0,
      quotaLimit,
      quotaUsage: 0,
      quotaUsageInDrive: 0,
      status: "active",
      lastError: null,
      lastUsedAt: null,
      lastQuotaSync: now,
      createdAt: now,
      updatedAt: now,
    };

    getDb().insert(googleAccounts).values(newAccount).run();

    return json({ account: publicAccount(newAccount) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
