import { connection } from "next/server";

import { handleRouteError, json } from "@/lib/api/response";
import { GatewayError } from "@/lib/errors";
import {
  createS3Credential,
  listS3Credentials,
} from "@/lib/s3/credentials";
import { publicS3Credential } from "@/lib/serializers";

export async function GET() {
  try {
    await connection();

    return json({
      credentials: listS3Credentials().map(publicS3Credential),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await connection();
    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      bucketId?: unknown;
      allowAllBuckets?: unknown;
      permission?: unknown;
      maxStorageBytes?: unknown;
    } | null;
    const name = typeof body?.name === "string" ? body.name : "";
    const bucketId =
      typeof body?.bucketId === "string" ? body.bucketId.trim() : "";
    const allowAllBuckets = body?.allowAllBuckets === true;
    const permission =
      body?.permission === "read-only"
        ? "read-only"
        : "read-write";
    const maxStorageBytes =
      typeof body?.maxStorageBytes === "number" &&
      body.maxStorageBytes > 0
        ? Math.floor(body.maxStorageBytes)
        : null;

    if (!name.trim()) {
      throw new GatewayError(
        "bad_request",
        "Credential name is required",
        400,
      );
    }

    if (!bucketId) {
      throw new GatewayError(
        "bad_request",
        "Select a bucket for this credential",
        400,
      );
    }

    if (bucketId === "*" && !allowAllBuckets) {
      throw new GatewayError(
        "bad_request",
        "Access to all buckets must be granted explicitly",
        400,
      );
    }

    const { credential, secretAccessKey } = createS3Credential({
      name,
      bucketId,
      allowAllBuckets,
      permission,
      maxStorageBytes,
    });

    return json(
      {
        credential: publicS3Credential(credential),
        secretAccessKey,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
