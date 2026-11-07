import { cookies } from "next/headers";

import { rotateSessionEpoch } from "./session-epoch";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSessionToken,
  verifySessionToken,
  type Session,
} from "./session-token";

export { SESSION_COOKIE };
export type { Session };

function cookieSecure(): boolean {
  const flag = process.env.COOKIE_SECURE?.trim();

  if (flag === "1") {
    return true;
  }

  if (flag === "0") {
    return false;
  }

  return (process.env.APP_URL ?? "").startsWith("https://");
}

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
    secure: cookieSecure(),
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function clearSessionCookie(
  revokeAll = true,
): Promise<void> {
  // Bumping the epoch revokes every outstanding session token, so a stolen
  // cookie cannot be replayed after the owner logs out. Only rotate when the
  // caller actually had a valid session, otherwise an unauthenticated
  // request could log everyone out.
  if (revokeAll) {
    rotateSessionEpoch();
  }

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
