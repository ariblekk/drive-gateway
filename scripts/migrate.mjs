import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const storageDir = process.env.STORAGE_DIR || "./data";
const databasePath =
  process.env.DATABASE_PATH || path.join(storageDir, "gateway.db");
const absolutePath = path.resolve(databasePath);
const migrationsFolder = path.resolve(
  process.cwd(),
  "lib",
  "db",
  "migrations",
);

fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

const sqlite = new Database(absolutePath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const db = drizzle(sqlite);

migrate(db, { migrationsFolder });

sqlite.close();

console.log(`[migrate] migrations applied to ${absolutePath}`);
