import { NextResponse } from "next/server";

import { setSessionCookie } from "@/lib/auth/session";
import { getAdminCredentials } from "@/lib/env";

function constantTimeEqual(input: string, expected: string): boolean {
  if (input.length !== expected.length) {
    return false;
  }

  let result = 0;

  for (let index = 0; index < input.length; index += 1) {
    result |= input.charCodeAt(index) ^ expected.charCodeAt(index);
  }

  return result === 0;
}

export async function POST(request: Request) {
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

  let credentials: { email: string; password: string };

  try {
    credentials = getAdminCredentials();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "config_error",
          message: "ADMIN_EMAIL and ADMIN_PASSWORD are not configured",
        },
      },
      { status: 500 },
    );
  }

  const emailMatches = constantTimeEqual(email, credentials.email);
  const passwordMatches = constantTimeEqual(password, credentials.password);

  if (!emailMatches || !passwordMatches) {
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

  await setSessionCookie(credentials.email);

  return NextResponse.json({ ok: true });
}
