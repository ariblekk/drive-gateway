import crypto from "node:crypto";

const password = process.argv[2];

if (!password) {
  console.error(
    "Usage: pnpm hash:password '<admin-password>'",
  );
  process.exit(1);
}

const N = 16384;
const r = 8;
const p = 1;
const salt = crypto.randomBytes(16);
const derived = crypto.scryptSync(password, salt, 64, {
  N,
  r,
  p,
  maxmem: 64 * 1024 * 1024,
});

const hash = [
  "scrypt",
  N,
  r,
  p,
  salt.toString("base64"),
  derived.toString("base64"),
].join("$");

// Next.js expands `$NAME` references in .env files. Escape separators so
// this output can be pasted into ADMIN_PASSWORD_HASH without being altered.
console.log(hash.replaceAll("$", "\\$"));
