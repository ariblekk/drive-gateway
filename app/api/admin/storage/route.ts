import { connection } from "next/server";

import { handleRouteError, json } from "@/lib/api/response";
import { getStorageSummary } from "@/lib/files/service";

export async function GET() {
  try {
    await connection();

    return json(await getStorageSummary());
  } catch (error) {
    return handleRouteError(error);
  }
}
