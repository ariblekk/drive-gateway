import { sql } from "drizzle-orm";

import {
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
import { createDriveClient, getAuthorizedClient } from "./client";

const MAX_PAGES = 100;
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

async function scanAccountTypeUsage(
  account: GoogleAccount,
): Promise<TypeUsageTotals> {
  const auth = await getAuthorizedClient(account);
  const drive = createDriveClient(auth);
  const totals = emptyTypeUsage();
  let pageToken: string | undefined;
  let pages = 0;

  do {
    const response = await drive.files.list({
      q: "'me' in owners and trashed = false",
      fields: "nextPageToken, files(mimeType, size)",
      pageSize: 1000,
      pageToken,
    });

    for (const file of response.data.files ?? []) {
      const category = classifyMimeType(file.mimeType ?? null);
      const size = Number(file.size ?? 0);
      totals[category].bytes += size;
      totals[category].count += 1;
    }

    pageToken = response.data.nextPageToken ?? undefined;
    pages += 1;
  } while (pageToken && pages < MAX_PAGES);

  return totals;
}

export async function syncAccountTypeUsage(
  account: GoogleAccount,
): Promise<TypeUsageTotals> {
  const totals = await scanAccountTypeUsage(account);
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

export async function syncAllTypeUsage(): Promise<{
  synced: number;
  failed: Array<{ id: string; email: string; error: string }>;
}> {
  const db = getDb();
  const accounts = db
    .select()
    .from(googleAccounts)
    .all()
    .filter((account) => account.status !== "disconnected");

  const results = await Promise.allSettled(
    accounts.map((account) => syncAccountTypeUsage(account)),
  );

  const failed: Array<{ id: string; email: string; error: string }> = [];
  let synced = 0;

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      synced += 1;
    } else {
      const account = accounts[index];
      failed.push({
        id: account.id,
        email: account.email,
        error: errorMessage(result.reason),
      });
    }
  });

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
