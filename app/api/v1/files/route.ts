import { requireApiKey } from "@/lib/api/auth";
import { handleRouteError, json, preflight, withCors } from "@/lib/api/response";
import { listFiles } from "@/lib/files/service";
import { publicFile } from "@/lib/serializers";

export const OPTIONS = preflight;

export async function GET(request: Request) {
  try {
    await requireApiKey(request);
    const { searchParams } = new URL(request.url);
    const result = listFiles({
      q: searchParams.get("q") ?? undefined,
      status: "active",
      folderId: searchParams.get("folderId") ?? undefined,
      limit: Number(searchParams.get("limit") ?? 50),
      offset: Number(searchParams.get("offset") ?? 0),
    });

    return withCors(
      json({
        files: result.files.map(publicFile),
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      }),
    );
  } catch (error) {
    return withCors(handleRouteError(error));
  }
}
