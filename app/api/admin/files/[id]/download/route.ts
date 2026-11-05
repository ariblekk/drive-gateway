import { buildDownloadResponse } from "@/lib/api/download-handler";
import { handleRouteError } from "@/lib/api/response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    return await buildDownloadResponse(id, request.headers.get("range"));
  } catch (error) {
    return handleRouteError(error);
  }
}
