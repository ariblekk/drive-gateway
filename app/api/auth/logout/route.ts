import { NextResponse } from "next/server";

import {
  clearSessionCookie,
  getSession,
} from "@/lib/auth/session";

export async function POST() {
  const session = await getSession();

  await clearSessionCookie(Boolean(session));

  return NextResponse.json({ ok: true });
}
