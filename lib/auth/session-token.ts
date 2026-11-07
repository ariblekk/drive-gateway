import { getSessionEpoch } from "./session-epoch";

export const SESSION_COOKIE = "dg_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface Session {
  email: string;
  expiresAt: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    Math.ceil(normalized.length / 4) * 4,
    "=",
  );
  const binary = atob(padded);

  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function getSigningKey(): Uint8Array | null {
  const raw = process.env.ENCRYPTION_KEY;

  if (!raw) {
    return null;
  }

  try {
    const key = base64UrlToBytes(raw);

    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

async function sign(payload: string, key: Uint8Array): Promise<string> {
  const keyData = new Uint8Array(key);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(payload),
  );

  return bytesToBase64Url(new Uint8Array(signature));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;

  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return result === 0;
}

export async function createSessionToken(email: string): Promise<string> {
  const key = getSigningKey();

  if (!key) {
    throw new Error(
      "ENCRYPTION_KEY must be a 32-byte base64 value to sign sessions",
    );
  }

  const expiresAt = Date.now() + SESSION_TTL_MS;
  const epoch = getSessionEpoch();
  const payload = `${bytesToBase64Url(encoder.encode(email))}.${expiresAt}.${epoch}`;
  const signature = await sign(payload, key);

  return `${payload}.${signature}`;
}

export async function verifySessionToken(
  token: string | null | undefined,
): Promise<Session | null> {
  if (!token) {
    return null;
  }

  const key = getSigningKey();

  if (!key) {
    return null;
  }

  const parts = token.split(".");

  if (parts.length !== 4) {
    return null;
  }

  const [emailPart, expiresPart, epochPart, signature] = parts;
  const payload = `${emailPart}.${expiresPart}.${epochPart}`;
  const expected = await sign(payload, key);

  if (!timingSafeEqual(signature, expected)) {
    return null;
  }

  const expiresAt = Number(expiresPart);

  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return null;
  }

  // Logout bumps the epoch, which invalidates every token issued before it.
  if (Number(epochPart) !== getSessionEpoch()) {
    return null;
  }

  try {
    const email = decoder.decode(base64UrlToBytes(emailPart));

    return email ? { email, expiresAt } : null;
  } catch {
    return null;
  }
}
