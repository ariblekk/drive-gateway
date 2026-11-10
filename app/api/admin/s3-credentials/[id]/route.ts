import { connection } from "next/server";

import { handleRouteError, json } from "@/lib/api/response";
import { GatewayError } from "@/lib/errors";
import { deleteS3Credential, updateS3Credential } from "@/lib/s3/credentials";
import { publicS3Credential } from "@/lib/serializers";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await connection();
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      bucketId?: unknown;
      permission?: unknown;
      maxStorageBytes?: unknown;
    } | null;
    const name = typeof body?.name === "string" ? body.name : "";
    const bucketId = typeof body?.bucketId === "string" ? body.bucketId.trim() : "";
    if (!name.trim() || !bucketId) {
      throw new GatewayError("bad_request", "Credential name and bucket are required", 400);
    }
    const credential = updateS3Credential(id, {
      name,
      bucketId,
      permission: body?.permission === "read-only" ? "read-only" : "read-write",
      maxStorageBytes:
        typeof body?.maxStorageBytes === "number" && body.maxStorageBytes > 0
          ? Math.floor(body.maxStorageBytes)
          : null,
    });
    if (!credential) {
      throw new GatewayError("not_found", "S3 credential not found", 404);
    }
    return json({ credential: publicS3Credential(credential) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await connection();
    const { id } = await params;
    const credential = deleteS3Credential(id);

    if (!credential) {
      throw new GatewayError(
        "not_found",
        "S3 credential not found",
        404,
      );
    }

    return json({ credential: publicS3Credential(credential) });
  } catch (error) {
    return handleRouteError(error);
  }
}
