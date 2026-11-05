import { unstable_rethrow } from "next/navigation";

import { errorMessage, GatewayError } from "@/lib/errors";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Api-Key, Range, X-File-Name, X-File-Type, X-File-Path",
  "Access-Control-Expose-Headers":
    "Content-Disposition, Content-Length, Content-Range, Accept-Ranges",
};

function applyCors(headers: Headers): void {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  applyCors(headers);
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

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  applyCors(headers);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function handleRouteError(error: unknown): Response {
  unstable_rethrow(error);

  if (error instanceof GatewayError) {
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
