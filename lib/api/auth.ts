import { createHash } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import { apiKeys, getDb, type ApiKey } from "@/lib/db";
import { GatewayError } from "@/lib/errors";
import {
  checkActionRateLimit,
  clearActionFailures,
  recordActionFailure,
} from "@/lib/auth/rate-limit";

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function extractApiKey(request: Request): string | null {
  const authorization = request.headers.get("authorization");

  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim() || null;
  }

  return request.headers.get("x-api-key")?.trim() || null;
}

export async function requireApiKey(request: Request): Promise<ApiKey> {
  const rawKey = extractApiKey(request);

  if (!rawKey) {
    throw new GatewayError(
      "unauthorized",
      "Provide an API key via Authorization: Bearer <key> or x-api-key",
      401,
    );
  }

  const rateLimit = checkActionRateLimit(request, "api-key");

  if (!rateLimit.allowed) {
    throw new GatewayError(
      "too_many_attempts",
      `Too many invalid API key attempts. Try again in ${rateLimit.retryAfterSeconds} seconds.`,
      429,
    );
  }

  const db = getDb();
  const key = db
    .select()
    .from(apiKeys)
    .where(
      and(eq(apiKeys.keyHash, hashApiKey(rawKey)), isNull(apiKeys.revokedAt)),
    )
    .get();

  if (!key) {
    recordActionFailure(request, "api-key");

    throw new GatewayError("unauthorized", "Invalid API key", 401);
  }

  clearActionFailures(request, "api-key");

  db.update(apiKeys)
    .set({ lastUsedAt: Date.now() })
    .where(eq(apiKeys.id, key.id))
    .run();

  return key;
}
