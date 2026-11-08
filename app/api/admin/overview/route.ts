import { connection } from "next/server";
import { desc, sql } from "drizzle-orm";

import {
  handleRouteError,
  json,
} from "@/lib/api/response";
import { activityLog, getDb, googleAccounts } from "@/lib/db";
import { getGlobalStats } from "@/lib/files/service";
import { publicActivity } from "@/lib/serializers";

export async function GET() {
  try {
    await connection();
    const db = getDb();
    const accounts = db.select().from(googleAccounts).all();
    const accountMap = new Map(accounts.map((account) => [account.id, account]));

    const recentActivity = db
      .select()
      .from(activityLog)
      .orderBy(desc(activityLog.createdAt))
      .limit(10)
      .all()
      .map((entry) => ({
        ...publicActivity(entry),
        accountEmail: entry.accountId
          ? (accountMap.get(entry.accountId)?.email ?? null)
          : null,
      }));

    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;

    const trafficRows = db
      .select({
        date: sql<string>`strftime('%Y-%m-%d', datetime(${activityLog.createdAt} / 1000, 'unixepoch', 'localtime'))`,
        uploadBytes: sql<number>`coalesce(sum(CASE WHEN ${activityLog.action} = 'upload' AND ${activityLog.status} = 'ok' THEN ${activityLog.bytes} ELSE 0 END), 0)`,
        downloadBytes: sql<number>`coalesce(sum(CASE WHEN ${activityLog.action} = 'download' AND ${activityLog.status} = 'ok' THEN ${activityLog.bytes} ELSE 0 END), 0)`,
      })
      .from(activityLog)
      .where(sql`${activityLog.createdAt} >= ${ninetyDaysAgo}`)
      .groupBy(
        sql`strftime('%Y-%m-%d', datetime(${activityLog.createdAt} / 1000, 'unixepoch', 'localtime'))`,
      )
      .orderBy(
        sql`strftime('%Y-%m-%d', datetime(${activityLog.createdAt} / 1000, 'unixepoch', 'localtime'))`,
      )
      .all();

    const trafficMap = new Map<
      string,
      { uploadBytes: number; downloadBytes: number }
    >();

    const cursor = new Date(ninetyDaysAgo);
    const now = new Date();

    while (cursor <= now) {
      const key = cursor.toISOString().slice(0, 10);
      trafficMap.set(key, { uploadBytes: 0, downloadBytes: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    for (const row of trafficRows) {
      if (row.date && trafficMap.has(row.date)) {
        trafficMap.set(row.date, {
          uploadBytes: Number(row.uploadBytes || 0),
          downloadBytes: Number(row.downloadBytes || 0),
        });
      }
    }

    const traffic = Array.from(trafficMap.entries()).map(
      ([date, val]) => ({
        date,
        ...val,
      }),
    );

    return json({
      stats: getGlobalStats(),
      recentActivity,
      traffic,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
