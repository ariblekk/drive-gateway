import { connection } from "next/server";

import { handleRouteError, json } from "@/lib/api/response";
import { GatewayError } from "@/lib/errors";
import {
  createFolder,
  getBreadcrumbs,
  listFolders,
} from "@/lib/folders/service";

export async function GET(request: Request) {
  try {
    await connection();
    const { searchParams } = new URL(request.url);
    const all = searchParams.get("all") === "1";
    const status = "active";
    const parentParam = searchParams.get("parentId") ?? "root";
    const parentId = parentParam === "root" ? null : parentParam;
    const bucketParam = searchParams.get("bucketId");
    const bucketId =
      bucketParam === "all" ? null : (bucketParam ?? "default");

    return json({
      folders: listFolders({ parentId, status, all, bucketId }),
      breadcrumbs: all ? [] : getBreadcrumbs(parentId),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      parentId?: unknown;
      bucketId?: unknown;
    } | null;
    const name = typeof body?.name === "string" ? body.name : "";
    const parentId =
      typeof body?.parentId === "string" &&
      body.parentId &&
      body.parentId !== "root"
        ? body.parentId
        : null;

    if (!name.trim()) {
      throw new GatewayError(
        "bad_request",
        "Folder name is required",
        400,
      );
    }

    const bucketId =
      typeof body?.bucketId === "string" && body.bucketId.trim()
        ? body.bucketId.trim()
        : "default";

    return json(
      { folder: createFolder({ name, parentId, bucketId }) },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
