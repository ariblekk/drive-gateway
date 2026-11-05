import { and, desc, eq } from "drizzle-orm";

import {
  files,
  folders,
  getDb,
  type Folder,
  type StoredFile,
} from "@/lib/db";
import {
  ensureFileEtag,
  getFileByBucketKey,
  trashFileById,
} from "@/lib/files/service";
import { buildFolderPathMap } from "@/lib/folders/service";

import { S3Error } from "./errors";
import type { S3ListEntry, S3ListResult } from "./xml";

function compareKeys(a: string, b: string): number {
  if (a < b) {
    return -1;
  }

  if (a > b) {
    return 1;
  }

  return 0;
}

function entryFromFile(file: StoredFile): S3ListEntry {
  return {
    key: file.key,
    size: file.size,
    etag: file.etag ?? file.id,
    updatedAt: file.updatedAt,
  };
}

export function listObjectsV2(input: {
  bucket: string;
  prefix?: string;
  delimiter?: string | null;
  maxKeys?: number;
  continuationToken?: string | null;
  startAfter?: string | null;
  encodingType?: string | null;
}): S3ListResult {
  const prefix = input.prefix ?? "";
  const delimiter = input.delimiter ?? null;
  const maxKeys = Math.min(
    Math.max(input.maxKeys ?? 1000, 1),
    1000,
  );

  const db = getDb();
  const rows = db
    .select()
    .from(files)
    .where(
      and(
        eq(files.bucketId, input.bucket),
        eq(files.status, "active"),
      ),
    )
    .all();

  const folderRows = db
    .select()
    .from(folders)
    .where(
      and(
        eq(folders.bucketId, input.bucket),
        eq(folders.status, "active"),
      ),
    )
    .all();

  const folderPaths = buildFolderPathMap(folderRows);

  const latest = new Map<string, StoredFile>();

  for (const row of rows) {
    const existing = latest.get(row.key);

    if (!existing || row.updatedAt > existing.updatedAt) {
      latest.set(row.key, row);
    }
  }

  const entries = Array.from(latest.values())
    .filter((file) => file.key.startsWith(prefix))
    .sort((a, b) => compareKeys(a.key, b.key));

  let token: string | null = null;

  if (input.continuationToken) {
    try {
      token = Buffer.from(
        input.continuationToken,
        "base64url",
      ).toString("utf8");
    } catch {
      throw new S3Error(
        "InvalidArgument",
        "Invalid continuation token",
        400,
      );
    }
  }

  const startAfter = token ?? input.startAfter ?? null;

  type Item =
    | { sortKey: string; kind: "object"; file: StoredFile }
    | { sortKey: string; kind: "prefix"; prefix: string };

  const items: Item[] = [];
  const seenPrefixes = new Set<string>();

  for (const folder of folderRows) {
    const p = folderPaths.get(folder.id) ?? "/";
    if (p === "/") continue;
    const folderKey = `${p.replace(/^\/+|\/+$/g, "")}/`;

    if (!folderKey.startsWith(prefix)) {
      continue;
    }

    if (startAfter && folderKey <= startAfter) {
      continue;
    }

    if (delimiter) {
      const remainder = folderKey.slice(prefix.length);
      const index = remainder.indexOf(delimiter);

      if (index >= 0) {
        const commonPrefix =
          prefix + remainder.slice(0, index + delimiter.length);

        if (!seenPrefixes.has(commonPrefix)) {
          seenPrefixes.add(commonPrefix);
          items.push({
            sortKey: commonPrefix,
            kind: "prefix",
            prefix: commonPrefix,
          });
        }
      }
    } else {
      if (!seenPrefixes.has(folderKey)) {
        seenPrefixes.add(folderKey);
        items.push({
          sortKey: folderKey,
          kind: "prefix",
          prefix: folderKey,
        });
      }
    }
  }

  for (const file of entries) {
    if (startAfter && file.key <= startAfter) {
      continue;
    }

    if (delimiter) {
      const remainder = file.key.slice(prefix.length);
      const index = remainder.indexOf(delimiter);

      if (index >= 0) {
        const commonPrefix =
          prefix + remainder.slice(0, index + delimiter.length);

        if (!seenPrefixes.has(commonPrefix)) {
          seenPrefixes.add(commonPrefix);
          items.push({
            sortKey: commonPrefix,
            kind: "prefix",
            prefix: commonPrefix,
          });
        }

        continue;
      }
    }

    items.push({
      sortKey: file.key,
      kind: "object",
      file,
    });
  }

  items.sort((a, b) => compareKeys(a.sortKey, b.sortKey));

  const page = items.slice(0, maxKeys);
  const isTruncated = items.length > page.length;
  const contents: S3ListEntry[] = [];
  const commonPrefixes: string[] = [];

  for (const item of page) {
    if (item.kind === "object") {
      contents.push(entryFromFile(item.file));
    } else {
      commonPrefixes.push(item.prefix);
    }
  }

  const last = page[page.length - 1];
  const nextContinuationToken =
    isTruncated && last
      ? Buffer.from(last.sortKey, "utf8").toString("base64url")
      : null;

  return {
    bucket: input.bucket,
    prefix,
    delimiter,
    maxKeys,
    encodingType: input.encodingType ?? null,
    isTruncated,
    nextContinuationToken,
    contents,
    commonPrefixes,
  };
}

export function findObject(
  bucket: string,
  key: string,
): StoredFile | null {
  return getFileByBucketKey(bucket, key);
}

export function requireObject(
  bucket: string,
  key: string,
): StoredFile {
  const file = findObject(bucket, key);

  if (!file) {
    throw new S3Error(
      "NoSuchKey",
      "The specified key does not exist",
      404,
    );
  }

  return file;
}

export function activeObjectsByKey(
  bucket: string,
  key: string,
): StoredFile[] {
  return getDb()
    .select()
    .from(files)
    .where(
      and(
        eq(files.bucketId, bucket),
        eq(files.key, key),
        eq(files.status, "active"),
      ),
    )
    .orderBy(desc(files.updatedAt))
    .all();
}

export async function trashObjectsByKey(
  bucket: string,
  key: string,
): Promise<number> {
  const existing = activeObjectsByKey(bucket, key);
  let trashed = 0;

  for (const file of existing) {
    try {
      await trashFileById(file.id);
      trashed += 1;
    } catch {
      // Best effort. The new object still becomes the active key.
    }
  }

  return trashed;
}

export function parseMetadata(
  raw: string | null,
): Record<string, unknown> {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function objectHeaders(
  file: StoredFile,
): Promise<Headers> {
  const etag = await ensureFileEtag(file);
  const headers = new Headers({
    "Content-Type": file.mimeType ?? "application/octet-stream",
    "Content-Length": String(file.size),
    "Last-Modified": new Date(file.updatedAt).toUTCString(),
    ETag: `"${etag}"`,
    "Accept-Ranges": "bytes",
  });

  const metadata = parseMetadata(file.metadata);
  const user = metadata.user;

  if (user && typeof user === "object") {
    for (const [name, value] of Object.entries(
      user as Record<string, unknown>,
    )) {
      if (typeof value === "string") {
        headers.set(`x-amz-meta-${name.toLowerCase()}`, value);
      }
    }
  }

  return headers;
}

export function extractUserMetadata(
  request: Request,
): Record<string, string> {
  const user: Record<string, string> = {};

  request.headers.forEach((value, name) => {
    if (name.toLowerCase().startsWith("x-amz-meta-")) {
      user[name.slice("x-amz-meta-".length).toLowerCase()] =
        value;
    }
  });

  return user;
}

export function findFolderByKey(
  bucketId: string,
  key: string,
): Folder | null {
  const cleanKey = key.replace(/^\/+|\/+$/g, "");
  const all = getDb()
    .select()
    .from(folders)
    .where(
      and(
        eq(folders.bucketId, bucketId),
        eq(folders.status, "active"),
      ),
    )
    .all();

  const paths = buildFolderPathMap(all);

  return (
    all.find((f) => {
      const p = (paths.get(f.id) ?? "/").replace(/^\/+|\/+$/g, "");
      return p.toLowerCase() === cleanKey.toLowerCase();
    }) ?? null
  );
}
