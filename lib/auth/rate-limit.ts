import { randomUUID } from "node:crypto";

import { and, eq, gt, lt, sql } from "drizzle-orm";

import { getDb, loginAttempts } from "@/lib/db";
import { getEnv } from "@/lib/env";

const DIRECT_IP = "direct";
const PRUNE_AFTER_MS = 24 * 60 * 60 * 1000;

const attemptColumns = {
  ip: loginAttempts.ip,
  email: loginAttempts.email,
};

type AttemptScope = keyof typeof attemptColumns;

export type LoginRateLimitResult =
  | { allowed: true }
  | {
      allowed: false;
      scope: AttemptScope;
      retryAfterSeconds: number;
    };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getClientIp(request: Request): string {
  const env = getEnv();

  // Trusting forwarded headers is only safe when a reverse proxy
  // overwrites them. When exposed directly, a client could spoof
  // the header and bypass the limiter entirely.
  if (env.TRUST_PROXY === 1) {
    const forwarded = request.headers.get("x-forwarded-for");

    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();

      if (first) {
        return first;
      }
    }

    const realIp = request.headers.get("x-real-ip")?.trim();

    if (realIp) {
      return realIp;
    }
  }

  return DIRECT_IP;
}

function windowMs(): number {
  return getEnv().LOGIN_WINDOW_MINUTES * 60 * 1000;
}

function countSince(
  scope: AttemptScope,
  value: string,
  since: number,
): { count: number; oldest: number } {
  const row = getDb()
    .select({
      count: sql<number>`count(*)`,
      oldest: sql<number>`coalesce(min(${loginAttempts.createdAt}), 0)`,
    })
    .from(loginAttempts)
    .where(
      and(
        eq(attemptColumns[scope], value),
        gt(loginAttempts.createdAt, since),
      ),
    )
    .get();

  return {
    count: Number(row?.count ?? 0),
    oldest: Number(row?.oldest ?? 0),
  };
}

function retryAfterSeconds(oldest: number, now: number): number {
  if (oldest <= 0) {
    return getEnv().LOGIN_WINDOW_MINUTES * 60;
  }

  return Math.max(
    1,
    Math.ceil((oldest + windowMs() - now) / 1000),
  );
}

export function checkLoginRateLimit(
  request: Request,
  email: string,
): LoginRateLimitResult {
  const env = getEnv();
  const now = Date.now();
  const since = now - windowMs();
  const ip = getClientIp(request);
  const normalizedEmail = normalizeEmail(email);

  const ipAttempts = countSince("ip", ip, since);

  if (ipAttempts.count >= env.LOGIN_MAX_PER_IP) {
    return {
      allowed: false,
      scope: "ip",
      retryAfterSeconds: retryAfterSeconds(ipAttempts.oldest, now),
    };
  }

  const emailAttempts = countSince(
    "email",
    normalizedEmail,
    since,
  );

  if (emailAttempts.count >= env.LOGIN_MAX_PER_EMAIL) {
    return {
      allowed: false,
      scope: "email",
      retryAfterSeconds: retryAfterSeconds(emailAttempts.oldest, now),
    };
  }

  return { allowed: true };
}

export function recordLoginFailure(
  request: Request,
  email: string,
): void {
  const now = Date.now();
  const db = getDb();

  db.insert(loginAttempts)
    .values({
      id: randomUUID(),
      ip: getClientIp(request),
      email: normalizeEmail(email),
      createdAt: now,
    })
    .run();

  db.delete(loginAttempts)
    .where(lt(loginAttempts.createdAt, now - PRUNE_AFTER_MS))
    .run();
}

export function clearLoginFailures(
  request: Request,
  email: string,
): void {
  getDb()
    .delete(loginAttempts)
    .where(
      and(
        eq(loginAttempts.ip, getClientIp(request)),
        eq(loginAttempts.email, normalizeEmail(email)),
      ),
    )
    .run();
}

/**
 * Actions that are protected by an admin password. Their failure counters are
 * keyed per IP in the same table as login attempts.
 */
export type RateLimitAction = "backup" | "restore";

const ACTION_LIMITS = {
  backup: "ADMIN_PASSWORD_MAX_ATTEMPTS",
  restore: "ADMIN_PASSWORD_MAX_ATTEMPTS",
} as const;

function actionKey(request: Request, action: RateLimitAction): string {
  return `action:${action}:${getClientIp(request)}`;
}

function pruneAttempts(now: number): void {
  getDb()
    .delete(loginAttempts)
    .where(lt(loginAttempts.createdAt, now - PRUNE_AFTER_MS))
    .run();
}

export function checkActionRateLimit(
  request: Request,
  action: RateLimitAction,
): LoginRateLimitResult {
  const env = getEnv();
  const now = Date.now();
  const since = now - windowMs();
  const attempts = countSince(
    "email",
    actionKey(request, action),
    since,
  );
  const max = env[ACTION_LIMITS[action]];

  if (attempts.count >= max) {
    return {
      allowed: false,
      scope: "email",
      retryAfterSeconds: retryAfterSeconds(attempts.oldest, now),
    };
  }

  return { allowed: true };
}

export function recordActionFailure(
  request: Request,
  action: RateLimitAction,
): void {
  const now = Date.now();

  getDb()
    .insert(loginAttempts)
    .values({
      id: randomUUID(),
      ip: getClientIp(request),
      email: actionKey(request, action),
      createdAt: now,
    })
    .run();

  pruneAttempts(now);
}

export function clearActionFailures(
  request: Request,
  action: RateLimitAction,
): void {
  getDb()
    .delete(loginAttempts)
    .where(
      eq(loginAttempts.email, actionKey(request, action)),
    )
    .run();
}
