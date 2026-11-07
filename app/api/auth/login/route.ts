import { NextResponse } from "next/server";

import {
  adminPasswordConfigured,
  constantTimeEqual,
  verifyAdminPassword,
} from "@/lib/auth/admin-password";
import { setSessionCookie } from "@/lib/auth/session";
import {
  checkLoginRateLimit,
  clearLoginFailures,
  recordLoginFailure,
} from "@/lib/auth/rate-limit";
import { getAdminEmail } from "@/lib/env";

export async function POST(request: Request) {
  const contentLength = Number(
    request.headers.get("content-length") ?? 0,
  );

  if (Number.isFinite(contentLength) && contentLength > 16 * 1024) {
    return NextResponse.json(
      {
        error: {
          code: "payload_too_large",
          message: "Login request is too large",
        },
      },
      { status: 413 },
    );
  }

  let body: unknown = null;

  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const record = (body ?? {}) as { email?: unknown; password?: unknown };
  const email = typeof record.email === "string" ? record.email.trim() : "";
  const password =
    typeof record.password === "string" ? record.password : "";

  const rateLimit = checkLoginRateLimit(request, email);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: {
          code: "too_many_attempts",
          message: `Too many failed login attempts. Try again in ${rateLimit.retryAfterSeconds} seconds.`,
        },
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  let adminEmail: string;

  try {
    adminEmail = getAdminEmail();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "config_error",
          message: "ADMIN_EMAIL is not configured",
        },
      },
      { status: 500 },
    );
  }

  if (!adminPasswordConfigured()) {
    return NextResponse.json(
      {
        error: {
          code: "config_error",
          message:
            "Set ADMIN_PASSWORD before logging in",
        },
      },
      { status: 500 },
    );
  }

  const emailMatches = constantTimeEqual(email, adminEmail);
  const passwordMatches = verifyAdminPassword(password);

  if (!emailMatches || !passwordMatches) {
    recordLoginFailure(request, email);

    return NextResponse.json(
      {
        error: {
          code: "invalid_credentials",
          message: "Invalid email or password",
        },
      },
      { status: 401 },
    );
  }

  clearLoginFailures(request, email);
  await setSessionCookie(adminEmail);

  return NextResponse.json({ ok: true });
}
