import crypto from "node:crypto";

import { activityLog, getDb } from "@/lib/db";

export function recordActivity(entry: {
  action: string;
  fileId?: string | null;
  accountId?: string | null;
  bytes?: number | null;
  status?: "ok" | "error";
  message?: string | null;
}): void {
  getDb()
    .insert(activityLog)
    .values({
      id: crypto.randomUUID(),
      action: entry.action,
      fileId: entry.fileId ?? null,
      accountId: entry.accountId ?? null,
      bytes: entry.bytes ?? null,
      status: entry.status ?? "ok",
      message: entry.message ?? null,
      createdAt: Date.now(),
    })
    .run();
}
