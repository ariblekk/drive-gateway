import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

import { lt } from "drizzle-orm";

import { activityLog, getDb } from "@/lib/db";

export type ActivitySource = "dashboard" | "s3" | "webdav";

const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

const sourceStore = new AsyncLocalStorage<ActivitySource>();
let prunedAt = 0;

/** Tag every activity written inside `fn` with the channel it came from. */
export function withActivitySource<T>(source: ActivitySource, fn: () => T): T {
  return sourceStore.run(source, fn);
}

function prune(now: number): void {
  if (now - prunedAt < PRUNE_INTERVAL_MS) return;

  prunedAt = now;
  getDb()
    .delete(activityLog)
    .where(lt(activityLog.createdAt, now - RETENTION_MS))
    .run();
}

export function recordActivity(entry: {
  action: string;
  fileId?: string | null;
  accountId?: string | null;
  bytes?: number | null;
  status?: "ok" | "error";
  source?: ActivitySource;
  message?: string | null;
}): void {
  const now = Date.now();
  prune(now);

  getDb()
    .insert(activityLog)
    .values({
      id: crypto.randomUUID(),
      action: entry.action,
      fileId: entry.fileId ?? null,
      accountId: entry.accountId ?? null,
      bytes: entry.bytes ?? null,
      status: entry.status ?? "ok",
      source: entry.source ?? sourceStore.getStore() ?? "dashboard",
      message: entry.message ?? null,
      createdAt: now,
    })
    .run();
}