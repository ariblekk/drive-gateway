import { connection } from "next/server";

import { handleRouteError, json } from "@/lib/api/response";
import { getEnv } from "@/lib/env";

export async function GET() {
  try {
    await connection();

    return json({
      maxUploadBytes: getEnv().MAX_UPLOAD_BYTES,
      s3Region: getEnv().S3_REGION,
      s3MaxPutBytes: getEnv().S3_MAX_PUT_BYTES,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
