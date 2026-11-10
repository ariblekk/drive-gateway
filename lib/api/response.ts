import { unstable_rethrow } from "next/navigation";

import { errorMessage, GatewayError } from "@/lib/errors";
import { S3Error } from "@/lib/s3/errors";

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(data), { ...init, headers });
}

export function jsonError(
  status: number,
  code: string,
  message: string,
): Response {
  return json({ error: { code, message } }, { status });
}

export function handleRouteError(error: unknown): Response {
  unstable_rethrow(error);

  if (error instanceof GatewayError || error instanceof S3Error) {
    return jsonError(error.status, error.code, error.message);
  }

  console.error("[gateway] unhandled route error", error);

  return jsonError(500, "internal_error", "Unexpected server error");
}

export function badRequest(message: string): never {
  throw new GatewayError("bad_request", message, 400);
}

export function describeError(error: unknown): string {
  return errorMessage(error);
}
