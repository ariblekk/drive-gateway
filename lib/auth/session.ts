import { cookies } from "next/headers";

import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSessionToken,
  verifySessionToken,
  type Session,
} from "./session-token";

export { SESSION_COOKIE };
export type { Session };

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();

  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function setSessionCookie(email: string): Promise<void> {
  const token = await createSessionToken(email);
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: (process.env.APP_URL ?? "").startsWith("https://"),
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
