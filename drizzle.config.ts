import "dotenv/config";

import path from "node:path";

import { defineConfig } from "drizzle-kit";

const storageDir = process.env.STORAGE_DIR ?? "./data";
const databaseUrl =
  process.env.DATABASE_PATH ?? path.join(storageDir, "gateway.db");

export default defineConfig({
  dialect: "sqlite",
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: true,
});
