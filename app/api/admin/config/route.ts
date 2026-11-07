import path from "node:path";

import { connection } from "next/server";

import { handleRouteError, json } from "@/lib/api/response";
import { getEnv } from "@/lib/env";

export async function GET() {
  try {
    await connection();

    const storageDir = path.resolve(getEnv().STORAGE_DIR);
    const databasePath = path.resolve(
      getEnv().DATABASE_PATH || path.join(storageDir, "gateway.db"),
    );

    return json({
      maxUploadBytes: getEnv().MAX_UPLOAD_BYTES,
      s3Region: getEnv().S3_REGION,
      s3MaxPutBytes: getEnv().S3_MAX_PUT_BYTES,
      databasePath,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
