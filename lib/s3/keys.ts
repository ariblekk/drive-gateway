import {
  createFolder,
  listFolders,
} from "@/lib/folders/service";

import { S3Error } from "./errors";

export const DEFAULT_BUCKET = "default";

export function parseS3Path(path?: string[]): {
  bucket: string | null;
  key: string;
} {
  if (!path || path.length === 0) {
    return { bucket: null, key: "" };
  }

  return {
    bucket: path[0] ?? null,
    key: path.slice(1).join("/"),
  };
}

export function keyFromPath(
  virtualPath: string,
  name: string,
): string {
  const prefix = virtualPath.replace(/^\/+|\/+$/g, "");

  return prefix ? `${prefix}/${name}` : name;
}

export function validateS3Key(key: string): void {
  if (!key) {
    throw new S3Error(
      "InvalidRequest",
      "Object key must not be empty",
      400,
    );
  }

  if (Buffer.byteLength(key, "utf8") > 1024) {
    throw new S3Error(
      "InvalidRequest",
      "Object key must be 1024 bytes or less",
      400,
    );
  }

  if (key.endsWith("/")) {
    throw new S3Error(
      "InvalidRequest",
      "Directory marker keys are not supported",
      400,
    );
  }

  const segments = key.split("/");

  if (segments.some((segment) => !segment)) {
    throw new S3Error(
      "InvalidRequest",
      "Object key must not contain empty segments",
      400,
    );
  }

  if (
    segments.some(
      (segment) => segment === "." || segment === "..",
    )
  ) {
    throw new S3Error(
      "InvalidRequest",
      "Object key must not contain . or .. segments",
      400,
    );
  }
}

export function sanitizeSegment(segment: string): string {
  const cleaned = segment
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim()
    .slice(0, 120);

  return cleaned || "folder";
}

export async function ensureFolderPath(
  key: string,
  bucketId = "default",
): Promise<string | null> {
  const segments = key.split("/");
  const directories = segments.slice(0, -1);

  if (directories.length === 0) {
    return null;
  }

  let parentId: string | null = null;
  type FolderWithPath = ReturnType<typeof createFolder>;

  for (const segment of directories) {
    const safeName = sanitizeSegment(segment);
    const children = listFolders({
      parentId,
      status: "active",
      bucketId,
    });

    let folder: FolderWithPath | undefined = children.find(
      (candidate) =>
        candidate.name.toLowerCase() === safeName.toLowerCase(),
    );

    if (!folder) {
      try {
        folder = createFolder({
          name: safeName,
          parentId,
          bucketId,
        });
      } catch (error) {
        const refreshed = listFolders({
          parentId,
          status: "active",
          bucketId,
        });
        const retry: FolderWithPath | undefined =
          refreshed.find(
            (candidate) =>
              candidate.name.toLowerCase() ===
              safeName.toLowerCase(),
          );

        if (!retry) {
          throw error;
        }

        folder = retry;
      }
    }

    if (!folder) {
      throw new Error("Failed to create virtual folder path");
    }

    parentId = folder.id;
  }

  return parentId;
}

export function isValidBucketName(name: string): boolean {
  if (name.length < 3 || name.length > 63) {
    return false;
  }

  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(name)) {
    return false;
  }

  if (name.includes("..") || name.includes(".-") || name.includes("-.")) {
    return false;
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(name)) {
    return false;
  }

  return true;
}
