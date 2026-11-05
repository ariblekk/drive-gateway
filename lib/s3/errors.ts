import crypto from "node:crypto";

import { GatewayError } from "@/lib/errors";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function s3ErrorXml(
  code: string,
  message: string,
  resource: string,
  requestId: string,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>${escapeXml(code)}</Code>
  <Message>${escapeXml(message)}</Message>
  <Resource>${escapeXml(resource)}</Resource>
  <RequestId>${escapeXml(requestId)}</RequestId>
</Error>`;
}

export class S3Error extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
    public readonly resource?: string,
  ) {
    super(message);
    this.name = "S3Error";
  }
}

function fromGatewayError(error: GatewayError): S3Error {
  switch (error.code) {
    case "not_found":
      return new S3Error("NoSuchKey", error.message, 404);
    case "unauthorized":
      return new S3Error("AccessDenied", error.message, 403);
    case "bad_request":
      return new S3Error("InvalidRequest", error.message, 400);
    case "payload_too_large":
      return new S3Error("EntityTooLarge", error.message, 413);
    case "no_capacity":
      return new S3Error(
        "ServiceUnavailable",
        "No connected Google account has enough free space",
        503,
      );
    case "upload_failed":
      return new S3Error("InternalError", error.message, 500);
    default:
      return new S3Error("InternalError", error.message, 500);
  }
}

export function toS3Error(error: unknown): S3Error {
  if (error instanceof S3Error) {
    return error;
  }

  if (error instanceof GatewayError) {
    return fromGatewayError(error);
  }

  return new S3Error(
    "InternalError",
    "We encountered an internal error. Please try again.",
    500,
  );
}

export function s3ErrorResponse(
  error: unknown,
  request: Request,
  head = false,
): Response {
  console.error("[S3 Error]", error);
  const s3Error = toS3Error(error);
  const requestId = crypto.randomUUID();
  const resource =
    s3Error.resource ?? new URL(request.url).pathname;

  const body = head
    ? ""
    : s3ErrorXml(
        s3Error.code,
        s3Error.message,
        resource,
        requestId,
      );

  return new Response(body, {
    status: s3Error.status,
    headers: {
      "content-type": "application/xml",
      "x-amz-request-id": requestId,
    },
  });
}

export function notImplemented(operation: string): S3Error {
  return new S3Error(
    "NotImplemented",
    `${operation} is not implemented`,
    501,
  );
}
