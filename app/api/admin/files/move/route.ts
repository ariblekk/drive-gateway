import { handleRouteError, json } from "@/lib/api/response";
import { GatewayError } from "@/lib/errors";
import { moveFilesToFolder } from "@/lib/folders/service";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      ids?: unknown;
      folderId?: unknown;
    } | null;

    if (
      !Array.isArray(body?.ids) ||
      body.ids.some((id) => typeof id !== "string")
    ) {
      throw new GatewayError(
        "bad_request",
        "ids must be an array of strings",
        400,
      );
    }

    const folderId =
      typeof body?.folderId === "string" &&
      body.folderId &&
      body.folderId !== "root"
        ? body.folderId
        : null;

    const moved = moveFilesToFolder(body.ids as string[], folderId);

    return json({ moved });
  } catch (error) {
    return handleRouteError(error);
  }
}
