import { handleRouteError, json } from "@/lib/api/response";
import { GatewayError } from "@/lib/errors";
import {
  moveFolder,
  renameFolder,
  deleteFolderPermanently,
} from "@/lib/folders/service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      parentId?: unknown;
    } | null;

    if (!body) {
      throw new GatewayError(
        "bad_request",
        "Request body is required",
        400,
      );
    }

    let folder = null;

    if (typeof body.name === "string") {
      folder = renameFolder(id, body.name);
    }

    if ("parentId" in body) {
      const parentId =
        typeof body.parentId === "string" &&
        body.parentId &&
        body.parentId !== "root"
          ? body.parentId
          : null;

      folder = moveFolder(id, parentId);
    }

    if (!folder) {
      throw new GatewayError(
        "bad_request",
        "Provide a name or parentId",
        400,
      );
    }

    return json({ folder });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const result = await deleteFolderPermanently(id);

    return json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
