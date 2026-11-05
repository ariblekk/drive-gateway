import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";

export type DatabaseClient = BetterSQLite3Database<typeof schema>;

const globalForDb = globalThis as unknown as {
  gatewayDb?: DatabaseClient;
};

export function getDb(): DatabaseClient {
  if (globalForDb.gatewayDb) {
    return globalForDb.gatewayDb;
  }

  const storageDir = process.env.STORAGE_DIR ?? "./data";
  const databasePath =
    process.env.DATABASE_PATH ?? path.join(storageDir, "gateway.db");
  const absolutePath = path.resolve(/* turbopackIgnore: true */ databasePath);

  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

  const sqlite = new Database(absolutePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });
  globalForDb.gatewayDb = db;

  return db;
}

export * from "./schema";
export { schema };
