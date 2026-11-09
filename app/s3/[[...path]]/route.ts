import crypto from "node:crypto";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { connection } from "next/server";

import { getEnv } from "@/lib/env";
import type { S3Credential } from "@/lib/db";
import { getCredentialUsage } from "@/lib/s3/credentials";
import {
  activeObjectsByKey,
  extractUserMetadata,
  findFolderByKey,
  findObject,
  listObjectsV2,
  objectHeaders,
  requireObject,
} from "@/lib/s3/objects";
import {
  createBucket,
  deleteBucket,
  ensureDefaultBucket,
  getBucketByName,
  listBuckets,
} from "@/lib/s3/buckets";
import {
  S3Error,
  notImplemented,
  s3ErrorResponse,
} from "@/lib/s3/errors";
import {
  ensureFolderPath,
  parseS3Path,
  validateS3Key,
} from "@/lib/s3/keys";
import {
  decodeAwsChunkedStream,
  isAwsChunked,
  verifyS3Request,
} from "@/lib/s3/sigv4";
import {
  aclXml,
  listBucketsXml,
  listObjectsV2Xml,
  locationXml,
  notificationXml,
  versioningXml,
  xmlResponse,
} from "@/lib/s3/xml";
import {
  createFolder,
  deleteFolderPermanently,
  sanitizeFolderName,
} from "@/lib/folders/service";
import {
  deleteFilePermanentlyById,
  openFileDownload,
  sanitizeFileName,
  saveUpload,
} from "@/lib/files/service";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

function readHeader(
  headers: unknown,
  name: string,
): string | null {
  if (!headers || typeof headers !== "object") {
    return null;
  }

  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name);
  }

  return (headers as Record<string, string>)[name] ?? null;
}

function requestId(): string {
  return crypto.randomUUID();
}

function parseMaxKeys(value: string | null): number {
  if (value === null || value === "") {
    return 1000;
  }

  const maxKeys = Number(value);

  if (!Number.isInteger(maxKeys) || maxKeys < 0) {
    throw new S3Error(
      "InvalidArgument",
      "max-keys must be a non-negative integer",
      400,
    );
  }

  return Math.min(maxKeys, 1000);
}

function contentMd5ToHex(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return Buffer.from(value, "base64").toString("hex");
  } catch {
    return undefined;
  }
}

function isHexSha256(value: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(value);
}

async function handleListBuckets(
  credential?: S3Credential,
): Promise<Response> {
  ensureDefaultBucket();
  let buckets = listBuckets();

  if (credential && credential.bucketId !== "*") {
    buckets = buckets.filter(
      (bucket) => bucket.name === credential.bucketId,
    );
  }

  return xmlResponse(
    200,
    listBucketsXml(
      buckets.map((bucket) => ({
        name: bucket.name,
        createdAt: bucket.createdAt,
      })),
    ),
  );
}

async function handleBucketGet(
  bucketName: string,
  url: URL,
): Promise<Response> {
  const bucket = getBucketByName(bucketName);

  if (!bucket) {
    throw new S3Error(
      "NoSuchBucket",
      "The specified bucket does not exist",
      404,
    );
  }

  if (url.searchParams.has("location")) {
    return xmlResponse(
      200,
      locationXml(getEnv().S3_REGION),
    );
  }

  if (url.searchParams.has("acl")) {
    return xmlResponse(200, aclXml());
  }

  if (url.searchParams.has("versioning")) {
    return xmlResponse(200, versioningXml());
  }

  if (url.searchParams.has("notification")) {
    return xmlResponse(200, notificationXml());
  }

  if (url.searchParams.has("cors")) {
    throw new S3Error(
      "NoSuchCORSConfiguration",
      "The CORS configuration does not exist",
      404,
      `/${bucketName}`,
    );
  }

  if (url.searchParams.has("policy")) {
    throw new S3Error(
      "NoSuchBucketPolicy",
      "The bucket policy does not exist",
      404,
      `/${bucketName}`,
    );
  }

  if (
    url.searchParams.has("lifecycle") ||
    url.searchParams.has("lifecycleConfiguration")
  ) {
    throw new S3Error(
      "NoSuchLifecycleConfiguration",
      "The lifecycle configuration does not exist",
      404,
      `/${bucketName}`,
    );
  }

  if (url.searchParams.has("tagging")) {
    throw new S3Error(
      "NoSuchTagSet",
      "The TagSet does not exist",
      404,
      `/${bucketName}`,
    );
  }

  if (url.searchParams.has("encryption")) {
    throw new S3Error(
      "ServerSideEncryptionConfigurationNotFoundError",
      "The server side encryption configuration was not found",
      404,
      `/${bucketName}`,
    );
  }

  if (url.searchParams.has("website")) {
    throw new S3Error(
      "NoSuchWebsiteConfiguration",
      "The specified bucket does not have a website configuration",
      404,
      `/${bucketName}`,
    );
  }

  const result = listObjectsV2({
    bucket: bucket.name,
    prefix: url.searchParams.get("prefix") ?? "",
    delimiter: url.searchParams.get("delimiter") || null,
    maxKeys: parseMaxKeys(url.searchParams.get("max-keys")),
    continuationToken: url.searchParams.get(
      "continuation-token",
    ),
    startAfter: url.searchParams.get("start-after"),
    encodingType: url.searchParams.get("encoding-type"),
  });

  return xmlResponse(200, listObjectsV2Xml(result));
}

async function handleGetObject(
  bucketName: string,
  key: string,
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);

  if (url.searchParams.has("acl")) {
    requireObject(bucketName, key);
    return xmlResponse(200, aclXml());
  }

  const file = requireObject(bucketName, key);
  const range = request.headers.get("range");
  const { response } = await openFileDownload(file.id, range);
  const headers = await objectHeaders(file);

  headers.set(
    "Content-Type",
    readHeader(response.headers, "content-type") ??
      file.mimeType ??
      "application/octet-stream",
  );

  const contentRange = readHeader(
    response.headers,
    "content-range",
  );

  if (contentRange) {
    headers.set("Content-Range", contentRange);
  }

  headers.set(
    "Content-Length",
    readHeader(response.headers, "content-length") ??
      String(file.size),
  );
  headers.set("x-amz-request-id", requestId());

  const stream = Readable.toWeb(
    response.data as unknown as Readable,
  ) as unknown as ReadableStream<Uint8Array>;

  return new Response(stream, {
    status: response.status === 206 ? 206 : 200,
    headers,
  });
}

async function handleHeadObject(
  bucketName: string,
  key: string,
  request: Request,
): Promise<Response> {
  const rawPath = decodeURIComponent(
    new URL(request.url).pathname,
  );
  const isFolder = rawPath.endsWith("/") || key.endsWith("/");

  if (isFolder) {
    const folder = findFolderByKey(bucketName, key);

    if (folder) {
      return new Response(null, {
        status: 200,
        headers: {
          "Content-Type": "application/x-directory",
          "Content-Length": "0",
          ETag: '"d41d8cd98f00b204e9800998ecf8427e"',
          "Last-Modified": new Date(folder.updatedAt).toUTCString(),
          "x-amz-request-id": requestId(),
        },
      });
    }
  }

  const file = requireObject(bucketName, key);
  const headers = await objectHeaders(file);
  headers.set("x-amz-request-id", requestId());

  return new Response(null, { status: 200, headers });
}

async function handlePutObject(
  bucketName: string,
  key: string,
  request: Request,
  payloadHash: string,
  credential: S3Credential,
): Promise<Response> {
  const bucket = getBucketByName(bucketName);

  if (!bucket) {
    throw new S3Error(
      "NoSuchBucket",
      "The specified bucket does not exist",
      404,
    );
  }

  const rawPath = decodeURIComponent(
    new URL(request.url).pathname,
  );
  const contentTypeRaw = (
    request.headers.get("content-type") ?? ""
  ).toLowerCase();
  const isFolder =
    rawPath.endsWith("/") ||
    key.endsWith("/") ||
    contentTypeRaw.includes("application/x-directory") ||
    request.headers.get("x-amz-meta-directory") === "true";

  if (isFolder) {
    const cleanKey = key.replace(/^\/+|\/+$/g, "");

    if (!cleanKey) {
      return new Response(null, {
        status: 200,
        headers: {
          ETag: '"d41d8cd98f00b204e9800998ecf8427e"',
          "x-amz-request-id": requestId(),
        },
      });
    }

    const segments = cleanKey.split("/").filter(Boolean);
    const folderName = segments.pop() ?? "New Folder";
    const parentPath = segments.join("/");
    const parentId = parentPath
      ? await ensureFolderPath(
          `${parentPath}/dummy`,
          bucket.name,
        )
      : null;

    createFolder({
      name: sanitizeFolderName(folderName),
      parentId,
      bucketId: bucket.name,
    });

    return new Response(null, {
      status: 200,
      headers: {
        ETag: '"d41d8cd98f00b204e9800998ecf8427e"',
        "x-amz-request-id": requestId(),
      },
    });
  }

  validateS3Key(key);

  if (request.headers.get("x-amz-copy-source")) {
    throw notImplemented("CopyObject");
  }

  const env = getEnv();
  const contentLength = Number(
    request.headers.get("content-length") ?? "",
  );
  const decodedLength = Number(
    request.headers.get("x-amz-decoded-content-length") ?? "",
  );

  let maxBytes = env.S3_MAX_PUT_BYTES;

  if (credential.maxStorageBytes) {
    const currentUsage = getCredentialUsage(credential);
    const incomingBytes =
      (Number.isFinite(decodedLength) && decodedLength > 0
        ? decodedLength
        : null) ??
      (Number.isFinite(contentLength) && contentLength > 0
        ? contentLength
        : null) ??
      0;

    if (currentUsage + incomingBytes > credential.maxStorageBytes) {
      throw new S3Error(
        "QuotaExceeded",
        `Storage quota exceeded. Allowed: ${credential.maxStorageBytes} bytes, Current usage: ${currentUsage} bytes`,
        403,
      );
    }

    const remaining = Math.max(
      0,
      credential.maxStorageBytes - currentUsage,
    );
    maxBytes = Math.min(maxBytes, remaining);
  }

  if (
    (Number.isFinite(contentLength) &&
      contentLength > maxBytes) ||
    (Number.isFinite(decodedLength) &&
      decodedLength > maxBytes)
  ) {
    throw new S3Error(
      "EntityTooLarge",
      "Your proposed upload exceeds the maximum allowed object size",
      413,
    );
  }

  if (!request.body) {
    throw new S3Error(
      "InvalidRequest",
      "Request body is required",
      400,
    );
  }

  const previous = activeObjectsByKey(bucket.name, key);
  const name = sanitizeFileName(key.split("/").pop() ?? "file");
  const contentType =
    request.headers.get("content-type") ??
    "application/octet-stream";
  const folderId = await ensureFolderPath(key, bucket.name);
  const metadata: Record<string, unknown> = {
    user: extractUserMetadata(request),
  };

  const contentDisposition = request.headers.get(
    "content-disposition",
  );
  const cacheControl = request.headers.get("cache-control");

  if (contentDisposition) {
    metadata.contentDisposition = contentDisposition;
  }

  if (cacheControl) {
    metadata.cacheControl = cacheControl;
  }

  const source = isAwsChunked(request, payloadHash)
    ? decodeAwsChunkedStream(
        Readable.fromWeb(
          request.body as unknown as NodeReadableStream<Uint8Array>,
        ),
      )
    : request.body;

  const stored = await saveUpload({
    data: source,
    name,
    mimeType: contentType,
    folderId,
    bucketId: bucket.name,
    key,
    metadata,
    expectedMd5: contentMd5ToHex(
      request.headers.get("content-md5"),
    ),
    expectedSha256: isHexSha256(payloadHash)
      ? payloadHash
      : undefined,
    maxBytes,
    s3CredentialId: credential.id,
  });

  for (const oldFile of previous) {
    await deleteFilePermanentlyById(oldFile.id, null, false);
  }

  const etag = stored.etag ?? stored.id;

  return new Response(null, {
    status: 200,
    headers: {
      ETag: `"${etag}"`,
      "x-amz-request-id": requestId(),
    },
  });
}

async function handleDeleteObject(
  bucketName: string,
  key: string,
  request: Request,
): Promise<Response> {
  const rawPath = decodeURIComponent(
    new URL(request.url).pathname,
  );
  const isFolder = rawPath.endsWith("/") || key.endsWith("/");

  if (isFolder) {
    const folder = findFolderByKey(bucketName, key);

    if (folder) {
      await deleteFolderPermanently(folder.id);

      return new Response(null, {
        status: 204,
        headers: { "x-amz-request-id": requestId() },
      });
    }
  }

  const file = findObject(bucketName, key);

  if (!file) {
    const folder = findFolderByKey(bucketName, key);

    if (folder) {
      await deleteFolderPermanently(folder.id);
    }

    return new Response(null, {
      status: 204,
      headers: { "x-amz-request-id": requestId() },
    });
  }

  await deleteFilePermanentlyById(file.id);

  return new Response(null, {
    status: 204,
    headers: { "x-amz-request-id": requestId() },
  });
}

async function handleRequest(
  request: Request,
  context: RouteContext,
  method: string,
): Promise<Response> {
  const head = method === "HEAD";

  try {
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: {
          Allow: "GET, HEAD, PUT, POST, DELETE, OPTIONS",
          "x-amz-request-id": requestId(),
        },
      });
    }

    await connection();
    const auth = await verifyS3Request(request);
    const { credential } = auth;

    if (
      credential.permission === "read-only" &&
      (method === "PUT" || method === "DELETE" || method === "POST")
    ) {
      throw new S3Error(
        "AccessDenied",
        "Write operations are not permitted with read-only credentials",
        403,
      );
    }

    ensureDefaultBucket();

    const { path } = await context.params;
    const { bucket, key } = parseS3Path(path);
    const url = new URL(request.url);

    if (!bucket) {
      if (method === "GET") {
        return handleListBuckets(credential);
      }

      throw new S3Error(
        "InvalidRequest",
        "A bucket name is required",
        400,
      );
    }

    if (credential.bucketId !== "*" && bucket !== credential.bucketId) {
      throw new S3Error(
        "AccessDenied",
        "You do not have access to this bucket",
        403,
      );
    }

    if (
      credential.bucketId !== "*" &&
      !key &&
      (method === "PUT" || method === "DELETE") &&
      !url.searchParams.has("acl")
    ) {
      throw new S3Error(
        "AccessDenied",
        "You are not authorized to create or delete buckets",
        403,
      );
    }

    if (method === "GET") {
      if (!key) {
        return handleBucketGet(bucket, url);
      }

      if (url.searchParams.has("uploadId")) {
        throw notImplemented("ListParts");
      }

      return handleGetObject(bucket, key, request);
    }

    if (method === "HEAD") {
      if (!key) {
        const bucketRow = getBucketByName(bucket);

        if (!bucketRow) {
          throw new S3Error(
            "NoSuchBucket",
            "The specified bucket does not exist",
            404,
          );
        }

        return new Response(null, {
          status: 200,
          headers: {
            "x-amz-bucket-region": getEnv().S3_REGION,
            "x-amz-request-id": requestId(),
          },
        });
      }

      return handleHeadObject(bucket, key, request);
    }

    if (method === "PUT") {
      if (!key) {
        if (url.searchParams.has("acl")) {
          return new Response(null, {
            status: 200,
            headers: { "x-amz-request-id": requestId() },
          });
        }

        createBucket(bucket);

        return new Response(null, {
          status: 200,
          headers: {
            Location: `/${bucket}`,
            "x-amz-request-id": requestId(),
          },
        });
      }

      if (url.searchParams.has("acl")) {
        requireObject(bucket, key);
        return new Response(null, {
          status: 200,
          headers: { "x-amz-request-id": requestId() },
        });
      }

      if (url.searchParams.has("uploadId")) {
        throw notImplemented("UploadPart");
      }

      return handlePutObject(
        bucket,
        key,
        request,
        auth.payloadHash,
        credential,
      );
    }

    if (method === "DELETE") {
      if (!key) {
        deleteBucket(bucket);
        return new Response(null, { status: 204 });
      }

      if (url.searchParams.has("uploadId")) {
        throw notImplemented("AbortMultipartUpload");
      }

      return handleDeleteObject(bucket, key, request);
    }

    if (method === "POST") {
      if (url.searchParams.has("delete")) {
        throw notImplemented("DeleteObjects");
      }

      if (url.searchParams.has("uploads")) {
        throw notImplemented("CreateMultipartUpload");
      }

      if (url.searchParams.has("uploadId")) {
        throw notImplemented("CompleteMultipartUpload");
      }

      throw notImplemented("POST");
    }

    throw new S3Error(
      "MethodNotAllowed",
      "The specified method is not allowed",
      405,
    );
  } catch (error) {
    return s3ErrorResponse(error, request, head);
  }
}

export async function GET(
  request: Request,
  context: RouteContext,
) {
  return handleRequest(request, context, "GET");
}

export async function HEAD(
  request: Request,
  context: RouteContext,
) {
  return handleRequest(request, context, "HEAD");
}

export async function PUT(
  request: Request,
  context: RouteContext,
) {
  return handleRequest(request, context, "PUT");
}

export async function DELETE(
  request: Request,
  context: RouteContext,
) {
  return handleRequest(request, context, "DELETE");
}

export async function POST(
  request: Request,
  context: RouteContext,
) {
  return handleRequest(request, context, "POST");
}

export async function OPTIONS(
  request: Request,
  context: RouteContext,
) {
  return handleRequest(request, context, "OPTIONS");
}
