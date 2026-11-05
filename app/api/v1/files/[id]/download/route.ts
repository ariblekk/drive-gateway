import { requireApiKey } from "@/lib/api/auth";
import { buildDownloadResponse } from "@/lib/api/download-handler";
import { handleRouteError, preflight, withCors } from "@/lib/api/response";

export const OPTIONS = preflight;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireApiKey(request);
    const { id } = await params;
    const response = await buildDownloadResponse(
      id,
      request.headers.get("range"),
    );

    return withCors(response);
  } catch (error) {
    return withCors(handleRouteError(error));
  }
}
