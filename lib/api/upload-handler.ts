import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { getEnv } from "@/lib/env";
import {
  sanitizeFileName,
  saveUpload,
} from "@/lib/files/service";
import { GatewayError } from "@/lib/errors";
import { json } from "@/lib/api/response";
import { publicFile } from "@/lib/serializers";

async function* limitUpload(
  source: ReadableStream<Uint8Array>,
  maxBytes: number,
): AsyncIterable<Uint8Array> {
  let total = 0;

  for await (const chunk of Readable.fromWeb(
    source as unknown as NodeReadableStream,
  )) {
    total += chunk.byteLength;

    if (total > maxBytes) {
      throw new GatewayError(
        "payload_too_large",
        `File exceeds the ${maxBytes} byte limit`,
        413,
      );
    }

    yield chunk;
  }
}

export async function handleUploadRequest(
  request: Request,
): Promise<Response> {
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  const env = getEnv();
  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = contentLengthHeader
    ? Number(contentLengthHeader)
    : undefined;

  if (
    contentLength !== undefined &&
    Number.isFinite(contentLength) &&
    contentLength > env.MAX_UPLOAD_BYTES
  ) {
    throw new GatewayError(
      "payload_too_large",
      `File exceeds the ${env.MAX_UPLOAD_BYTES} byte limit`,
      413,
    );
  }

  if (contentType.startsWith("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      throw new GatewayError(
        "bad_request",
        "Expected a 'file' field in the multipart form",
        400,
      );
    }

    if (file.size > env.MAX_UPLOAD_BYTES) {
      throw new GatewayError(
        "payload_too_large",
        `File exceeds the ${env.MAX_UPLOAD_BYTES} byte limit`,
        413,
      );
    }

    const name = sanitizeFileName(
      String(form.get("name") ?? file.name ?? "file"),
    );
    const virtualPath = String(form.get("path") ?? "/");
    const folderIdRaw = form.get("folderId");
    const folderId =
      typeof folderIdRaw === "string" &&
      folderIdRaw &&
      folderIdRaw !== "root"
        ? folderIdRaw
        : null;
    const bucketIdRaw = form.get("bucketId");
    const bucketId =
      typeof bucketIdRaw === "string" && bucketIdRaw.trim()
        ? bucketIdRaw.trim()
        : "default";

    const stored = await saveUpload({
      data: file.stream(),
      size: file.size,
      name,
      mimeType: file.type || "application/octet-stream",
      path: virtualPath,
      folderId,
      bucketId,
    });

    return json({ file: publicFile(stored) }, { status: 201 });
  }

  if (!request.body) {
    throw new GatewayError("bad_request", "Request body is required", 400);
  }

  const { searchParams } = new URL(request.url);
  const rawName =
    searchParams.get("name") ?? request.headers.get("x-file-name");

  if (!rawName) {
    throw new GatewayError(
      "bad_request",
      "name query or x-file-name header is required for raw uploads",
      400,
    );
  }

  const rawFolderId =
    searchParams.get("folderId") ?? request.headers.get("x-folder-id");
  const folderId =
    rawFolderId && rawFolderId !== "root" ? rawFolderId : null;
  const rawBucketId =
    searchParams.get("bucketId") ?? request.headers.get("x-bucket-id");
  const bucketId =
    rawBucketId && rawBucketId.trim() ? rawBucketId.trim() : "default";

  const stored = await saveUpload({
    data: limitUpload(request.body, env.MAX_UPLOAD_BYTES),
    name: sanitizeFileName(rawName),
    mimeType:
      request.headers.get("x-file-type") ??
      request.headers.get("content-type") ??
      "application/octet-stream",
    path:
      searchParams.get("path") ??
      request.headers.get("x-file-path") ??
      "/",
    folderId,
    bucketId,
  });

  return json({ file: publicFile(stored) }, { status: 201 });
}
