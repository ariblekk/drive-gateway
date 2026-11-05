import crypto from "node:crypto";

import { cookies } from "next/headers";

import { getEnv } from "@/lib/env";
import { buildAuthUrl } from "@/lib/google/oauth";

export async function GET() {
  const state = crypto.randomUUID();
  const cookieStore = await cookies();

  cookieStore.set("g_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: getEnv().APP_URL.startsWith("https://"),
    path: "/",
    maxAge: 600,
  });

  return Response.redirect(buildAuthUrl(state), 302);
}
