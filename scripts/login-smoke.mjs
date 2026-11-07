import path from "node:path";

import Database from "better-sqlite3";

const baseUrl = (
  process.env.SMOKE_BASE_URL ??
  process.env.APP_URL ??
  "http://localhost:3000"
).replace(/\/$/, "");
const maxAttempts = Number(process.env.SMOKE_MAX_ATTEMPTS ?? 5);
const email = `smoke-${Date.now()}@example.test`;
const password = "definitely-wrong-password";
const dbPath =
  process.env.SMOKE_DB_PATH ??
  path.join(process.env.STORAGE_DIR ?? "./data", "gateway.db");
const allowCleanup = process.env.SMOKE_ALLOW_DB_CLEANUP === "1";

let failed = false;

function assert(condition, message) {
  if (condition) {
    console.log(`ok: ${message}`);
    return;
  }

  failed = true;
  console.error(`FAIL: ${message}`);
}

function cleanup() {
  if (!allowCleanup) {
    return;
  }

  try {
    const db = new Database(dbPath);
    // Local test only: the limiter key is "direct" when TRUST_PROXY is off.
    db.prepare("DELETE FROM login_attempts WHERE ip = ?").run("direct");
    db.close();
  } catch (error) {
    console.warn(
      `warn: could not clean login_attempts from ${dbPath}: ${error.message}`,
    );
  }
}

async function attempt() {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const retryAfter = response.headers.get("retry-after");

  return {
    status: response.status,
    retryAfter: retryAfter === null ? null : Number(retryAfter),
    body: await response.text().catch(() => ""),
  };
}

cleanup();

console.log(`base: ${baseUrl}`);
console.log(`email: ${email}`);
console.log(`attempts allowed per IP: ${maxAttempts}`);

for (let index = 1; index <= maxAttempts; index += 1) {
  const result = await attempt();

  assert(
    result.status === 401,
    `attempt ${index}: expected 401, got ${result.status} ${result.body}`,
  );
}

const blocked = await attempt();

assert(
  blocked.status === 429,
  `attempt ${maxAttempts + 1}: expected 429, got ${blocked.status} ${blocked.body}`,
);
assert(
  blocked.retryAfter !== null && blocked.retryAfter > 0,
  `Retry-After header is a positive number (${blocked.retryAfter})`,
);

let payload = null;

try {
  payload = JSON.parse(blocked.body);
} catch {
  payload = null;
}

assert(
  payload?.error?.code === "too_many_attempts",
  `error code is too_many_attempts (got ${payload?.error?.code})`,
);

cleanup();

if (!allowCleanup) {
  console.log(
    "note: set SMOKE_ALLOW_DB_CLEANUP=1 to remove the limiter rows afterwards",
  );
}

if (failed) {
  process.exit(1);
}

console.log("login rate limit smoke test passed");
