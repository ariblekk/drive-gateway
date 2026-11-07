import crypto from "node:crypto";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

function hash(value: string): Buffer {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

export function constantTimeEqual(input: string, expected: string): boolean {
  const provided = hash(input);
  const actual = hash(expected);

  return crypto.timingSafeEqual(provided, actual);
}

export function hashAdminPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });

  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

function verifyScryptHash(input: string, encoded: string): boolean {
  const parts = encoded.split("$");

  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);

  if (
    !Number.isInteger(n) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    n <= 0 ||
    r <= 0 ||
    p <= 0
  ) {
    return false;
  }

  let salt: Buffer;
  let expected: Buffer;

  try {
    salt = Buffer.from(parts[4] ?? "", "base64");
    expected = Buffer.from(parts[5] ?? "", "base64");
  } catch {
    return false;
  }

  if (salt.length === 0 || expected.length === 0) {
    return false;
  }

  let derived: Buffer;

  try {
    derived = crypto.scryptSync(input, salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: SCRYPT_MAXMEM,
    });
  } catch {
    return false;
  }

  return (
    derived.length === expected.length &&
    crypto.timingSafeEqual(derived, expected)
  );
}

export function adminPasswordConfigured(): boolean {
  return Boolean(
    process.env.ADMIN_PASSWORD_HASH?.trim() ||
      process.env.ADMIN_PASSWORD,
  );
}

export function verifyAdminPassword(input: string): boolean {
  const hashValue = process.env.ADMIN_PASSWORD_HASH?.trim();

  if (hashValue) {
    return verifyScryptHash(input, hashValue);
  }

  const plaintext = process.env.ADMIN_PASSWORD;

  if (!plaintext) {
    return false;
  }

  // Hash both sides first so the comparison does not leak length.
  return constantTimeEqual(input, plaintext);
}
