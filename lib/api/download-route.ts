import {
  buildDownloadResponse,
  readDownloadOptions,
  type DownloadOptions,
} from "@/lib/api/download-handler";
import { handleRouteError } from "@/lib/api/response";

type RouteHandler = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;

export function downloadRoute(
  method: NonNullable<DownloadOptions["method"]>,
  overrides: Omit<DownloadOptions, "method"> = {},
): RouteHandler {
  return async (request, { params }) => {
    try {
      const { id } = await params;

      return await buildDownloadResponse(
        id,
        readDownloadOptions(request, { ...overrides, method }),
      );
    } catch (error) {
      return handleRouteError(error);
    }
  };
}
