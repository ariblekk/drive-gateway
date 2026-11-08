import assert from "node:assert/strict";
import path from "node:path";
import Database from "better-sqlite3";

const dbPath = path.resolve("./data/gateway.db");
const db = new Database(dbPath);

const testAccountId = `acc-test-${Date.now()}`;
const testBucketName = `bkt-test-${Date.now()}`;
const now = Date.now();

try {
  db.prepare(
    `INSERT INTO storage_accounts (id, provider, email, refresh_token, status, quota_limit, quota_usage, quota_usage_in_drive, created_at, updated_at)
     VALUES (?, 'google', 'test@example.com', 'dummy_token', 'active', 1000, 0, 0, ?, ?)`
  ).run(testAccountId, now, now);

  db.prepare(
    "INSERT INTO buckets (id, name, storage_account_id, created_at) VALUES (?, ?, ?, ?)"
  ).run(testBucketName, testBucketName, testAccountId, now);

  const row = db.prepare("SELECT * FROM buckets WHERE name = ?").get(testBucketName);
  assert.ok(row, "Bucket should be inserted");
  assert.equal(row.storage_account_id, testAccountId, "storage_account_id should match");

  db.prepare("DELETE FROM buckets WHERE id = ?").run(testBucketName);
  assert.equal(db.prepare("SELECT * FROM buckets WHERE name = ?").get(testBucketName), undefined);

  console.log("Bucket specific storage assertion check passed.");
} finally {
  try {
    db.prepare("DELETE FROM buckets WHERE id = ?").run(testBucketName);
    db.prepare("DELETE FROM storage_accounts WHERE id = ?").run(testAccountId);
  } catch {
    // cleanup
  }
  db.close();
}
