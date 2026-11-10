import { and, eq, sql } from "drizzle-orm";

import {
  files,
  getDb,
  googleAccounts,
  typeUsage,
  type GoogleAccount,
  type TypeUsage,
} from "@/lib/db";
import { errorMessage } from "@/lib/errors";
import {
  classifyMimeType,
  emptyTypeUsage,
  type TypeUsageTotals,
} from "@/lib/files/mime";

export const TYPE_USAGE_STALE_MS = 30 * 60 * 1000;

function totalsToColumns(totals: TypeUsageTotals) {
  return {
    photosBytes: totals.photos.bytes,
    photosCount: totals.photos.count,
    videosBytes: totals.videos.bytes,
    videosCount: totals.videos.count,
    documentsBytes: totals.documents.bytes,
    documentsCount: totals.documents.count,
    otherBytes: totals.other.bytes,
    otherCount: totals.other.count,
  };
}

export function typeUsageRowToTotals(row: TypeUsage): TypeUsageTotals {
  return {
    photos: { bytes: row.photosBytes, count: row.photosCount },
    videos: { bytes: row.videosBytes, count: row.videosCount },
    documents: { bytes: row.documentsBytes, count: row.documentsCount },
    other: { bytes: row.otherBytes, count: row.otherCount },
  };
}

function scanAccountTypeUsage(account: GoogleAccount): TypeUsageTotals {
  const rows = getDb()
    .select({ mimeType: files.mimeType, size: files.size })
    .from(files)
    .where(and(eq(files.accountId, account.id), eq(files.status, "active")))
    .all();

  const totals = emptyTypeUsage();

  for (const row of rows) {
    const category = classifyMimeType(row.mimeType);
    totals[category].bytes += row.size;
    totals[category].count += 1;
  }

  return totals;
}

export function syncAccountTypeUsage(
  account: GoogleAccount,
): TypeUsageTotals {
  const totals = scanAccountTypeUsage(account);
  const db = getDb();
  const columns = totalsToColumns(totals);
  const now = Date.now();

  db.insert(typeUsage)
    .values({ accountId: account.id, ...columns, syncedAt: now })
    .onConflictDoUpdate({
      target: typeUsage.accountId,
      set: { ...columns, syncedAt: now },
    })
    .run();

  return totals;
}

export function syncAllTypeUsage(): {
  synced: number;
  failed: Array<{ id: string; email: string; error: string }>;
} {
  const db = getDb();
  const accounts = db
    .select()
    .from(googleAccounts)
    .all()
    .filter((account) => account.status !== "disconnected");

  const failed: Array<{ id: string; email: string; error: string }> = [];
  let synced = 0;

  for (const account of accounts) {
    try {
      syncAccountTypeUsage(account);
      synced += 1;
    } catch (error) {
      failed.push({
        id: account.id,
        email: account.email,
        error: errorMessage(error),
      });
    }
  }

  return { synced, failed };
}

export function adjustTypeUsage(
  accountId: string,
  mimeType: string | null,
  deltaBytes: number,
  deltaCount: number,
): void {
  const category = classifyMimeType(mimeType);
  const db = getDb();
  const base = {
    accountId,
    photosBytes: 0,
    photosCount: 0,
    videosBytes: 0,
    videosCount: 0,
    documentsBytes: 0,
    documentsCount: 0,
    otherBytes: 0,
    otherCount: 0,
    syncedAt: 0,
  };

  if (category === "photos") {
    base.photosBytes = Math.max(0, deltaBytes);
    base.photosCount = Math.max(0, deltaCount);
    db.insert(typeUsage)
      .values(base)
      .onConflictDoUpdate({
        target: typeUsage.accountId,
        set: {
          photosBytes: sql`max(0, ${typeUsage.photosBytes} + ${deltaBytes})`,
          photosCount: sql`max(0, ${typeUsage.photosCount} + ${deltaCount})`,
        },
      })
      .run();
    return;
  }

  if (category === "videos") {
    base.videosBytes = Math.max(0, deltaBytes);
    base.videosCount = Math.max(0, deltaCount);
    db.insert(typeUsage)
      .values(base)
      .onConflictDoUpdate({
        target: typeUsage.accountId,
        set: {
          videosBytes: sql`max(0, ${typeUsage.videosBytes} + ${deltaBytes})`,
          videosCount: sql`max(0, ${typeUsage.videosCount} + ${deltaCount})`,
        },
      })
      .run();
    return;
  }

  if (category === "documents") {
    base.documentsBytes = Math.max(0, deltaBytes);
    base.documentsCount = Math.max(0, deltaCount);
    db.insert(typeUsage)
      .values(base)
      .onConflictDoUpdate({
        target: typeUsage.accountId,
        set: {
          documentsBytes: sql`max(0, ${typeUsage.documentsBytes} + ${deltaBytes})`,
          documentsCount: sql`max(0, ${typeUsage.documentsCount} + ${deltaCount})`,
        },
      })
      .run();
    return;
  }

  base.otherBytes = Math.max(0, deltaBytes);
  base.otherCount = Math.max(0, deltaCount);
  db.insert(typeUsage)
    .values(base)
    .onConflictDoUpdate({
      target: typeUsage.accountId,
      set: {
        otherBytes: sql`max(0, ${typeUsage.otherBytes} + ${deltaBytes})`,
        otherCount: sql`max(0, ${typeUsage.otherCount} + ${deltaCount})`,
      },
    })
    .run();
}
