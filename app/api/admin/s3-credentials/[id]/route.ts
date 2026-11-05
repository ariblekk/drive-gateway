import { connection } from "next/server";

import { handleRouteError, json } from "@/lib/api/response";
import { GatewayError } from "@/lib/errors";
import { revokeS3Credential } from "@/lib/s3/credentials";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await connection();
    const { id } = await params;
    const credential = revokeS3Credential(id);

    if (!credential) {
      throw new GatewayError(
        "not_found",
        "S3 credential not found",
        404,
      );
    }

    return json({ credential });
  } catch (error) {
    return handleRouteError(error);
  }
}
