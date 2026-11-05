import { requireApiKey } from "@/lib/api/auth";
import { handleRouteError, json, preflight, withCors } from "@/lib/api/response";
import { getGlobalStats } from "@/lib/files/service";

export const OPTIONS = preflight;

export async function GET(request: Request) {
  try {
    await requireApiKey(request);

    return withCors(json(getGlobalStats()));
  } catch (error) {
    return withCors(handleRouteError(error));
  }
}
