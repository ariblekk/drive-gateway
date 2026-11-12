import crypto from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { and, eq, isNull } from "drizzle-orm";

import {
  files,
  folders,
  getDb,
  type Bucket,
  type Folder,
  type StoredFile,
} from "@/lib/db";
import { getEnv } from "@/lib/env";
import { withActivitySource } from "@/lib/activity";
import { constantTimeEqual, verifyAdminPassword } from "@/lib/auth/admin-password";
import {
  decryptS3Secret,
  findS3Credential,
  touchS3Credential,
} from "@/lib/s3/credentials";
import {
  createBucket,
  deleteBucket,
  ensureDefaultBucket,
  getBucketByName,
  listBuckets,
} from "@/lib/s3/buckets";
import {
  createFolder,
  getFolderPath,
  moveFolder,
  renameFolder,
  deleteFolderPermanently,
} from "@/lib/folders/service";
import {
  openFileDownload,
  saveUpload,
  deleteFilePermanentlyById,
} from "@/lib/files/service";
import { keyFromPath } from "@/lib/s3/keys";
import { formatBytes } from "@/lib/format";

export interface WebDavAuth {
  user: string;
  permission: "read-write" | "read-only";
  allowedBucket: string | null;
  s3CredentialId?: string | null;
}

export type ResolvedWebDavPath =
  | { type: "root" }
  | { type: "bucket"; bucket: Bucket }
  | {
      type: "folder";
      bucket: Bucket;
      folder: Folder;
      parentId: string | null;
      displayPath: string;
    }
  | {
      type: "file";
      bucket: Bucket;
      file: StoredFile;
      parentId: string | null;
      displayPath: string;
    }
  | {
      type: "not_found";
      bucket?: Bucket;
      parentFolderId: string | null;
      targetName: string;
      isBucketLevel: boolean;
    };

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function authenticateWebDav(req: NextApiRequest): WebDavAuth | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return null;
  }

  let credentials = "";
  try {
    credentials = Buffer.from(authHeader.slice(6).trim(), "base64").toString(
      "utf8",
    );
  } catch {
    return null;
  }

  const colonIdx = credentials.indexOf(":");
  if (colonIdx === -1) {
    return null;
  }

  const username = credentials.slice(0, colonIdx);
  const password = credentials.slice(colonIdx + 1);

  const env = getEnv();

  // 1. Admin login (full access)
  if (
    constantTimeEqual(username.toLowerCase(), env.ADMIN_EMAIL.toLowerCase()) &&
    verifyAdminPassword(password)
  ) {
    return {
      user: username,
      permission: "read-write",
      allowedBucket: null,
    };
  }

  // 2. S3 Credentials
  const s3Cred = findS3Credential(username);
  if (s3Cred) {
    try {
      const secret = decryptS3Secret(s3Cred);
      if (constantTimeEqual(password, secret)) {
        touchS3Credential(s3Cred.id);
        return {
          user: s3Cred.name,
          permission: s3Cred.permission as "read-write" | "read-only",
          allowedBucket: s3Cred.bucketId === "*" ? null : s3Cred.bucketId,
          s3CredentialId: s3Cred.id,
        };
      }
    } catch {
      // decrypt failed
    }
  }

  return null;
}

export function resolveWebDavPath(
  segments: string[],
): ResolvedWebDavPath {
  if (segments.length === 0) {
    return { type: "root" };
  }

  const bucketName = segments[0];
  const bucket = getBucketByName(bucketName);

  if (!bucket) {
    return {
      type: "not_found",
      targetName: segments[segments.length - 1],
      parentFolderId: null,
      isBucketLevel: segments.length === 1,
    };
  }

  if (segments.length === 1) {
    return { type: "bucket", bucket };
  }

  let currentFolderId: string | null = null;
  const db = getDb();
  const subsegments = segments.slice(1);

  // Navigate through intermediate directories
  for (let i = 0; i < subsegments.length - 1; i += 1) {
    const seg = subsegments[i];
    const folder = db
      .select()
      .from(folders)
      .where(
        and(
          eq(folders.bucketId, bucket.name),
          currentFolderId
            ? eq(folders.parentId, currentFolderId)
            : isNull(folders.parentId),
          eq(folders.status, "active"),
          eq(folders.name, seg),
        ),
      )
      .get();

    if (!folder) {
      return {
        type: "not_found",
        bucket,
        parentFolderId: currentFolderId,
        targetName: subsegments[subsegments.length - 1],
        isBucketLevel: false,
      };
    }

    currentFolderId = folder.id;
  }

  const lastSeg = subsegments[subsegments.length - 1];

  // Check if target is a folder
  const targetFolder = db
    .select()
    .from(folders)
    .where(
      and(
        eq(folders.bucketId, bucket.name),
        currentFolderId
          ? eq(folders.parentId, currentFolderId)
          : isNull(folders.parentId),
        eq(folders.status, "active"),
        eq(folders.name, lastSeg),
      ),
    )
    .get();

  if (targetFolder) {
    return {
      type: "folder",
      bucket,
      folder: targetFolder,
      parentId: currentFolderId,
      displayPath: segments.map(encodeURIComponent).join("/"),
    };
  }

  // Check if target is a file
  const targetFile = db
    .select()
    .from(files)
    .where(
      and(
        eq(files.bucketId, bucket.name),
        currentFolderId
          ? eq(files.folderId, currentFolderId)
          : isNull(files.folderId),
        eq(files.status, "active"),
        eq(files.name, lastSeg),
      ),
    )
    .get();

  if (targetFile) {
    return {
      type: "file",
      bucket,
      file: targetFile,
      parentId: currentFolderId,
      displayPath: segments.map(encodeURIComponent).join("/"),
    };
  }

  return {
    type: "not_found",
    bucket,
    parentFolderId: currentFolderId,
    targetName: lastSeg,
    isBucketLevel: false,
  };
}

function parseDestinationSegments(
  destinationHeader: string,
  basePrefix: string,
): string[] {
  let pathname = destinationHeader;
  try {
    if (
      destinationHeader.startsWith("http://") ||
      destinationHeader.startsWith("https://")
    ) {
      pathname = new URL(destinationHeader).pathname;
    }
  } catch {
    // fallback to original string
  }

  if (pathname.startsWith(basePrefix)) {
    pathname = pathname.slice(basePrefix.length);
  } else if (pathname.startsWith("/webdav")) {
    pathname = pathname.slice("/webdav".length);
  } else if (pathname.startsWith("/api/webdav")) {
    pathname = pathname.slice("/api/webdav".length);
  }

  return decodeURIComponent(pathname)
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
}

function renderPropResponse(item: {
  href: string;
  name: string;
  isCollection: boolean;
  size?: number;
  mimeType?: string | null;
  createdAt?: number;
  updatedAt?: number;
  etag?: string | null;
}): string {
  const lastModified = new Date(item.updatedAt ?? Date.now()).toUTCString();
  const creationDate = new Date(item.createdAt ?? Date.now()).toISOString();

  return `  <D:response>
    <D:href>${escapeXml(item.href)}</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>${escapeXml(item.name)}</D:displayname>
        <D:resourcetype>${item.isCollection ? "<D:collection/>" : ""}</D:resourcetype>
        ${
          !item.isCollection && item.size !== undefined
            ? `<D:getcontentlength>${item.size}</D:getcontentlength>`
            : ""
        }
        ${
          !item.isCollection && item.mimeType
            ? `<D:getcontenttype>${escapeXml(item.mimeType)}</D:getcontenttype>`
            : ""
        }
        <D:getlastmodified>${lastModified}</D:getlastmodified>
        <D:creationdate>${creationDate}</D:creationdate>
        ${item.etag ? `<D:getetag>"${escapeXml(item.etag)}"</D:getetag>` : ""}
        <D:supportedlock>
          <D:lockentry>
            <D:lockscope><D:exclusive/></D:lockscope>
            <D:locktype><D:write/></D:locktype>
          </D:lockentry>
        </D:supportedlock>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`;
}

export async function handleWebDavRequest(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  return withActivitySource("webdav", () => handleWebDavRequestUntagged(req, res));
}

async function handleWebDavRequestUntagged(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  const method = (req.method ?? "GET").toUpperCase();

  // Always allow CORS & WebDAV compliance headers on preflight
  if (method === "OPTIONS") {
    res.setHeader("DAV", "1, 2");
    res.setHeader("MS-Author-Via", "DAV");
    res.setHeader(
      "Allow",
      "OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK",
    );
    res.setHeader("Accept-Ranges", "bytes");
    res.status(200).end();
    return;
  }

  // Authenticate user
  const auth = authenticateWebDav(req);
  if (!auth) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Omnibucket WebDAV"');
    res.status(401).end("Unauthorized");
    return;
  }

  ensureDefaultBucket();

  const rawPath = req.query.path;
  const segments: string[] = Array.isArray(rawPath)
    ? rawPath
    : typeof rawPath === "string"
      ? [rawPath]
      : [];
  const cleanSegments = segments.map((s) => s.trim()).filter(Boolean);

  const basePrefix = req.url?.startsWith("/api/webdav")
    ? "/api/webdav"
    : "/webdav";

  // Check bucket isolation for restricted S3 credentials
  if (
    auth.allowedBucket &&
    cleanSegments.length > 0 &&
    cleanSegments[0] !== auth.allowedBucket
  ) {
    res.status(403).end("Forbidden: Access restricted to assigned bucket");
    return;
  }

  const resolved = resolveWebDavPath(cleanSegments);

  try {
    switch (method) {
      case "PROPFIND": {
        const depth = (req.headers.depth as string | undefined) ?? "1";

        if (resolved.type === "not_found") {
          res.status(404).end("Not Found");
          return;
        }

        const responses: string[] = [];

        if (resolved.type === "root") {
          // Self
          responses.push(
            renderPropResponse({
              href: `${basePrefix}/`,
              name: "Omnibucket",
              isCollection: true,
            }),
          );

          if (depth !== "0") {
            let buckets = listBuckets();
            if (auth.allowedBucket) {
              buckets = buckets.filter((b) => b.name === auth.allowedBucket);
            }
            for (const b of buckets) {
              responses.push(
                renderPropResponse({
                  href: `${basePrefix}/${encodeURIComponent(b.name)}/`,
                  name: b.name,
                  isCollection: true,
                  createdAt: b.createdAt,
                  updatedAt: b.createdAt,
                }),
              );
            }
          }
        } else if (resolved.type === "bucket") {
          // Self
          responses.push(
            renderPropResponse({
              href: `${basePrefix}/${encodeURIComponent(resolved.bucket.name)}/`,
              name: resolved.bucket.name,
              isCollection: true,
              createdAt: resolved.bucket.createdAt,
              updatedAt: resolved.bucket.createdAt,
            }),
          );

          if (depth !== "0") {
            const db = getDb();
            const childFolders = db
              .select()
              .from(folders)
              .where(
                and(
                  eq(folders.bucketId, resolved.bucket.name),
                  isNull(folders.parentId),
                  eq(folders.status, "active"),
                ),
              )
              .all();

            for (const f of childFolders) {
              responses.push(
                renderPropResponse({
                  href: `${basePrefix}/${encodeURIComponent(resolved.bucket.name)}/${encodeURIComponent(f.name)}/`,
                  name: f.name,
                  isCollection: true,
                  createdAt: f.createdAt,
                  updatedAt: f.updatedAt,
                }),
              );
            }

            const childFiles = db
              .select()
              .from(files)
              .where(
                and(
                  eq(files.bucketId, resolved.bucket.name),
                  isNull(files.folderId),
                  eq(files.status, "active"),
                ),
              )
              .all();

            for (const file of childFiles) {
              responses.push(
                renderPropResponse({
                  href: `${basePrefix}/${encodeURIComponent(resolved.bucket.name)}/${encodeURIComponent(file.name)}`,
                  name: file.name,
                  isCollection: false,
                  size: file.size,
                  mimeType: file.mimeType,
                  createdAt: file.createdAt,
                  updatedAt: file.updatedAt,
                  etag: file.etag,
                }),
              );
            }
          }
        } else if (resolved.type === "folder") {
          // Self
          responses.push(
            renderPropResponse({
              href: `${basePrefix}/${resolved.displayPath}/`,
              name: resolved.folder.name,
              isCollection: true,
              createdAt: resolved.folder.createdAt,
              updatedAt: resolved.folder.updatedAt,
            }),
          );

          if (depth !== "0") {
            const db = getDb();
            const childFolders = db
              .select()
              .from(folders)
              .where(
                and(
                  eq(folders.bucketId, resolved.bucket.name),
                  eq(folders.parentId, resolved.folder.id),
                  eq(folders.status, "active"),
                ),
              )
              .all();

            for (const f of childFolders) {
              responses.push(
                renderPropResponse({
                  href: `${basePrefix}/${resolved.displayPath}/${encodeURIComponent(f.name)}/`,
                  name: f.name,
                  isCollection: true,
                  createdAt: f.createdAt,
                  updatedAt: f.updatedAt,
                }),
              );
            }

            const childFiles = db
              .select()
              .from(files)
              .where(
                and(
                  eq(files.bucketId, resolved.bucket.name),
                  eq(files.folderId, resolved.folder.id),
                  eq(files.status, "active"),
                ),
              )
              .all();

            for (const file of childFiles) {
              responses.push(
                renderPropResponse({
                  href: `${basePrefix}/${resolved.displayPath}/${encodeURIComponent(file.name)}`,
                  name: file.name,
                  isCollection: false,
                  size: file.size,
                  mimeType: file.mimeType,
                  createdAt: file.createdAt,
                  updatedAt: file.updatedAt,
                  etag: file.etag,
                }),
              );
            }
          }
        } else if (resolved.type === "file") {
          // Self
          responses.push(
            renderPropResponse({
              href: `${basePrefix}/${resolved.displayPath}`,
              name: resolved.file.name,
              isCollection: false,
              size: resolved.file.size,
              mimeType: resolved.file.mimeType,
              createdAt: resolved.file.createdAt,
              updatedAt: resolved.file.updatedAt,
              etag: resolved.file.etag,
            }),
          );
        }

        const xml = `<?xml version="1.0" encoding="utf-8"?>\n<D:multistatus xmlns:D="DAV:">\n${responses.join("\n")}\n</D:multistatus>`;
        res
          .status(207)
          .setHeader("Content-Type", "application/xml; charset=utf-8")
          .end(xml);
        return;
      }

      case "GET":
      case "HEAD": {
        const isHead = method === "HEAD";

        if (resolved.type === "not_found") {
          res.status(404).end("Not Found");
          return;
        }

        if (
          resolved.type === "root" ||
          resolved.type === "bucket" ||
          resolved.type === "folder"
        ) {
          if (isHead) {
            res
              .status(200)
              .setHeader("Content-Type", "text/html; charset=utf-8")
              .end();
            return;
          }

          // HTML directory listing for browser visitors
          let items: Array<{ name: string; href: string; isDir: boolean; size: string }> = [];
          let title = "Root";

          if (resolved.type === "root") {
            title = "Omnibucket";
            let buckets = listBuckets();
            if (auth.allowedBucket) {
              buckets = buckets.filter((b) => b.name === auth.allowedBucket);
            }
            items = buckets.map((b) => ({
              name: b.name,
              href: `${basePrefix}/${encodeURIComponent(b.name)}/`,
              isDir: true,
              size: "-",
            }));
          } else if (resolved.type === "bucket") {
            title = `Bucket: ${resolved.bucket.name}`;
            const db = getDb();
            const childFolders = db
              .select()
              .from(folders)
              .where(
                and(
                  eq(folders.bucketId, resolved.bucket.name),
                  isNull(folders.parentId),
                  eq(folders.status, "active"),
                ),
              )
              .all();
            const childFiles = db
              .select()
              .from(files)
              .where(
                and(
                  eq(files.bucketId, resolved.bucket.name),
                  isNull(files.folderId),
                  eq(files.status, "active"),
                ),
              )
              .all();

            items = [
              ...childFolders.map((f) => ({
                name: f.name,
                href: `${basePrefix}/${encodeURIComponent(resolved.bucket.name)}/${encodeURIComponent(f.name)}/`,
                isDir: true,
                size: "-",
              })),
              ...childFiles.map((file) => ({
                name: file.name,
                href: `${basePrefix}/${encodeURIComponent(resolved.bucket.name)}/${encodeURIComponent(file.name)}`,
                isDir: false,
                size: formatBytes(file.size),
              })),
            ];
          } else {
            title = `Folder: ${resolved.folder.name}`;
            const db = getDb();
            const childFolders = db
              .select()
              .from(folders)
              .where(
                and(
                  eq(folders.bucketId, resolved.bucket.name),
                  eq(folders.parentId, resolved.folder.id),
                  eq(folders.status, "active"),
                ),
              )
              .all();
            const childFiles = db
              .select()
              .from(files)
              .where(
                and(
                  eq(files.bucketId, resolved.bucket.name),
                  eq(files.folderId, resolved.folder.id),
                  eq(files.status, "active"),
                ),
              )
              .all();

            items = [
              ...childFolders.map((f) => ({
                name: f.name,
                href: `${basePrefix}/${resolved.displayPath}/${encodeURIComponent(f.name)}/`,
                isDir: true,
                size: "-",
              })),
              ...childFiles.map((file) => ({
                name: file.name,
                href: `${basePrefix}/${resolved.displayPath}/${encodeURIComponent(file.name)}`,
                isDir: false,
                size: formatBytes(file.size),
              })),
            ];
          }

          const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeXml(title)} - WebDAV</title>
  <style>
    body { font-family: ui-monospace, Menlo, Consolas, sans-serif; padding: 2rem; background: #0f172a; color: #f8fafc; }
    h2 { margin-bottom: 1rem; color: #38bdf8; }
    table { width: 100%; max-width: 900px; border-collapse: collapse; }
    th, td { text-align: left; padding: 0.6rem; border-bottom: 1px solid #334155; }
    th { color: #94a3b8; font-size: 0.85rem; text-transform: uppercase; }
    a { color: #38bdf8; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .folder { font-weight: bold; }
  </style>
</head>
<body>
  <h2>${escapeXml(title)}</h2>
  <table>
    <thead><tr><th>Name</th><th>Size</th></tr></thead>
    <tbody>
      ${items
        .map(
          (it) =>
            `<tr><td><a class="${it.isDir ? "folder" : ""}" href="${escapeXml(it.href)}">${escapeXml(it.name)}${it.isDir ? "/" : ""}</a></td><td>${it.size}</td></tr>`,
        )
        .join("\n")}
    </tbody>
  </table>
</body>
</html>`;
          res
            .status(200)
            .setHeader("Content-Type", "text/html; charset=utf-8")
            .end(html);
          return;
        }

        // Stream file download
        const range = (req.headers.range as string | undefined) ?? null;
        const { file, response } = await openFileDownload(
          resolved.file.id,
          range,
        );

        res.setHeader(
          "Content-Type",
          file.mimeType || "application/octet-stream",
        );
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("ETag", `"${file.etag || file.id}"`);
        res.setHeader(
          "Last-Modified",
          new Date(file.updatedAt).toUTCString(),
        );
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${encodeURIComponent(file.name)}"`,
        );

        if (response.status === 206) {
          const contentRange = (response.headers as Record<string, string>)[
            "content-range"
          ];
          if (contentRange) {
            res.setHeader("Content-Range", contentRange);
          }
          res.status(206);
        } else {
          res.setHeader("Content-Length", file.size);
          res.status(200);
        }

        if (isHead) {
          res.end();
          return;
        }

        (response.data as import("node:stream").Readable).pipe(res);
        return;
      }

      case "PUT": {
        if (auth.permission === "read-only") {
          res.status(403).end("Forbidden: Read-only access");
          return;
        }

        let bucketName: string;
        let folderId: string | null = null;
        let fileName: string;
        let isOverwrite = false;

        if (resolved.type === "file") {
          bucketName = resolved.bucket.name;
          folderId = resolved.parentId;
          fileName = resolved.file.name;
          isOverwrite = true;
        } else if (resolved.type === "not_found") {
          if (!resolved.bucket) {
            res
              .status(409)
              .end("Conflict: Cannot upload directly to root without bucket");
            return;
          }
          bucketName = resolved.bucket.name;
          folderId = resolved.parentFolderId;
          fileName = resolved.targetName;
        } else {
          res.status(405).end("Method Not Allowed: Target is a collection");
          return;
        }

        const contentLength = req.headers["content-length"]
          ? Number(req.headers["content-length"])
          : undefined;
        const contentType =
          (req.headers["content-type"] as string | undefined) ||
          "application/octet-stream";

        const virtualPath = folderId ? getFolderPath(folderId) : "/";

        await saveUpload({
          data: req,
          size: contentLength,
          name: fileName,
          mimeType: contentType,
          path: virtualPath,
          folderId,
          bucketId: bucketName,
          s3CredentialId: auth.s3CredentialId ?? null,
        });

        res.status(isOverwrite ? 204 : 201).end();
        return;
      }

      case "MKCOL": {
        if (auth.permission === "read-only") {
          res.status(403).end("Forbidden: Read-only access");
          return;
        }

        if (resolved.type !== "not_found") {
          res.status(405).end("Method Not Allowed: Resource already exists");
          return;
        }

        if (resolved.isBucketLevel) {
          // Creating a new bucket at root
          createBucket(resolved.targetName);
          res.status(201).end();
          return;
        }

        if (!resolved.bucket) {
          res.status(409).end("Conflict: Parent bucket does not exist");
          return;
        }

        createFolder({
          name: resolved.targetName,
          parentId: resolved.parentFolderId,
          bucketId: resolved.bucket.name,
        });

        res.status(201).end();
        return;
      }

      case "DELETE": {
        if (auth.permission === "read-only") {
          res.status(403).end("Forbidden: Read-only access");
          return;
        }

        if (resolved.type === "file") {
          await deleteFilePermanentlyById(resolved.file.id);
          res.status(204).end();
          return;
        }

        if (resolved.type === "folder") {
          await deleteFolderPermanently(resolved.folder.id);
          res.status(204).end();
          return;
        }

        if (resolved.type === "bucket") {
          deleteBucket(resolved.bucket.name);
          res.status(204).end();
          return;
        }

        if (resolved.type === "root") {
          res.status(405).end("Method Not Allowed: Cannot delete root");
          return;
        }

        res.status(404).end("Not Found");
        return;
      }

      case "MOVE": {
        if (auth.permission === "read-only") {
          res.status(403).end("Forbidden: Read-only access");
          return;
        }

        const destHeader = req.headers.destination as string | undefined;
        if (!destHeader) {
          res.status(400).end("Bad Request: Missing Destination header");
          return;
        }

        const destSegments = parseDestinationSegments(destHeader, basePrefix);
        const destResolved = resolveWebDavPath(destSegments);

        if (resolved.type === "file") {
          let destBucket: Bucket;
          let destFolderId: string | null = null;
          let destName: string;
          let existed = false;

          if (destResolved.type === "file") {
            destBucket = destResolved.bucket;
            destFolderId = destResolved.parentId;
            destName = destResolved.file.name;
            existed = true;
            await deleteFilePermanentlyById(destResolved.file.id, false);
          } else if (destResolved.type === "not_found") {
            if (!destResolved.bucket) {
              res.status(409).end("Conflict: Destination bucket does not exist");
              return;
            }
            destBucket = destResolved.bucket;
            destFolderId = destResolved.parentFolderId;
            destName = destResolved.targetName;
          } else {
            res.status(409).end("Conflict: Destination is a collection");
            return;
          }

          const destVirtualPath = destFolderId
            ? getFolderPath(destFolderId)
            : "/";
          const newKey = keyFromPath(destVirtualPath, destName);

          getDb()
            .update(files)
            .set({
              name: destName,
              folderId: destFolderId,
              path: destVirtualPath,
              key: newKey,
              bucketId: destBucket.name,
              updatedAt: Date.now(),
            })
            .where(eq(files.id, resolved.file.id))
            .run();

          res.status(existed ? 204 : 201).end();
          return;
        }

        if (resolved.type === "folder") {
          if (destResolved.type !== "not_found") {
            res
              .status(409)
              .end("Conflict: Destination resource already exists");
            return;
          }

          if (!destResolved.bucket) {
            res.status(409).end("Conflict: Destination bucket does not exist");
            return;
          }

          if (destResolved.parentFolderId !== resolved.parentId) {
            moveFolder(resolved.folder.id, destResolved.parentFolderId);
          }
          if (destResolved.targetName !== resolved.folder.name) {
            renameFolder(resolved.folder.id, destResolved.targetName);
          }

          res.status(201).end();
          return;
        }

        res.status(400).end("Bad Request: Cannot move this resource type");
        return;
      }

      case "COPY": {
        if (auth.permission === "read-only") {
          res.status(403).end("Forbidden: Read-only access");
          return;
        }

        const destHeader = req.headers.destination as string | undefined;
        if (!destHeader) {
          res.status(400).end("Bad Request: Missing Destination header");
          return;
        }

        const destSegments = parseDestinationSegments(destHeader, basePrefix);
        const destResolved = resolveWebDavPath(destSegments);

        if (resolved.type === "file") {
          let destBucket: Bucket;
          let destFolderId: string | null = null;
          let destName: string;

          if (destResolved.type === "file") {
            destBucket = destResolved.bucket;
            destFolderId = destResolved.parentId;
            destName = destResolved.file.name;
            await deleteFilePermanentlyById(destResolved.file.id, false);
          } else if (destResolved.type === "not_found") {
            if (!destResolved.bucket) {
              res.status(409).end("Conflict: Destination bucket does not exist");
              return;
            }
            destBucket = destResolved.bucket;
            destFolderId = destResolved.parentFolderId;
            destName = destResolved.targetName;
          } else {
            res.status(409).end("Conflict: Destination is a collection");
            return;
          }

          const { file, response } = await openFileDownload(
            resolved.file.id,
            null,
          );
          const destVirtualPath = destFolderId
            ? getFolderPath(destFolderId)
            : "/";

          await saveUpload({
            data: response.data as import("node:stream").Readable,
            size: file.size,
            name: destName,
            mimeType: file.mimeType || "application/octet-stream",
            path: destVirtualPath,
            folderId: destFolderId,
            bucketId: destBucket.name,
            s3CredentialId: auth.s3CredentialId ?? null,
          });

          res.status(201).end();
          return;
        }

        res.status(501).end("Not Implemented: Recursive collection copy");
        return;
      }

      case "LOCK": {
        // ponytail: WebDAV lock tokens are ephemeral and stateless; add persistent lock table when multi-client concurrent write leases are needed.
        const token = crypto.randomUUID();
        res.setHeader("Lock-Token", `<urn:uuid:${token}>`);
        res
          .status(200)
          .setHeader("Content-Type", "application/xml; charset=utf-8")
          .end(`<?xml version="1.0" encoding="utf-8"?>
<D:prop xmlns:D="DAV:">
  <D:lockdiscovery>
    <D:activelock>
      <D:locktype><D:write/></D:locktype>
      <D:lockscope><D:exclusive/></D:lockscope>
      <D:depth>0</D:depth>
      <D:owner><D:href>Omnibucket</D:href></D:owner>
      <D:timeout>Second-3600</D:timeout>
      <D:locktoken><D:href>urn:uuid:${token}</D:href></D:locktoken>
      <D:lockroot><D:href>${escapeXml(req.url || "/")}</D:href></D:lockroot>
    </D:activelock>
  </D:lockdiscovery>
</D:prop>`);
        return;
      }

      case "UNLOCK": {
        res.status(204).end();
        return;
      }

      case "PROPPATCH": {
        res
          .status(207)
          .setHeader("Content-Type", "application/xml; charset=utf-8")
          .end(`<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>${escapeXml(req.url || "/")}</D:href>
    <D:propstat>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`);
        return;
      }

      default:
        res.status(405).end(`Method ${method} Not Allowed`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    res.status(500).end(message);
  }
}
