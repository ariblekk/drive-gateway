import crypto from "node:crypto";

function hash(value: string): Buffer {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

export function constantTimeEqual(input: string, expected: string): boolean {
  return crypto.timingSafeEqual(hash(input), hash(expected));
}

export function adminPasswordConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

export function verifyAdminPassword(input: string): boolean {
  const password = process.env.ADMIN_PASSWORD;
  return password ? constantTimeEqual(input, password) : false;
}
