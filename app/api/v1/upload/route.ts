import { requireApiKey } from "@/lib/api/auth";
import { handleRouteError, preflight, withCors } from "@/lib/api/response";
import { handleUploadRequest } from "@/lib/api/upload-handler";

export const OPTIONS = preflight;

export async function POST(request: Request) {
  try {
    const apiKey = await requireApiKey(request);
    const response = await handleUploadRequest(request, apiKey.id);

    return withCors(response);
  } catch (error) {
    return withCors(handleRouteError(error));
  }
}
