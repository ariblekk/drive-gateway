import { connection } from "next/server";
import { and, eq, sql } from "drizzle-orm";

import { handleRouteError, json } from "@/lib/api/response";
import { activityLog, files, getDb } from "@/lib/db";

const RANGE_DAYS = 30;
const RETRIEVED_ACTIONS = ["download", "preview"];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await connection();
    const { id } = await params;
    const since = Date.now() - RANGE_DAYS * 24 * 60 * 60 * 1000;

    const rows = getDb()
      .select({
        date: sql<string>`strftime('%Y-%m-%d', datetime(${activityLog.createdAt} / 1000, 'unixepoch', 'localtime'))`,
        action: activityLog.action,
        requests: sql<number>`count(*)`,
        bytes: sql<number>`coalesce(sum(${activityLog.bytes}), 0)`,
      })
      .from(activityLog)
      .innerJoin(files, eq(files.id, activityLog.fileId))
      .where(
        and(
          eq(files.bucketId, id),
          sql`${activityLog.createdAt} >= ${since}`,
        ),
      )
      .groupBy(
        sql`strftime('%Y-%m-%d', datetime(${activityLog.createdAt} / 1000, 'unixepoch', 'localtime'))`,
        activityLog.action,
      )
      .all();

    const trafficMap = new Map<string, number>();
    const cursor = new Date(since);
    const now = new Date();

    while (cursor <= now) {
      trafficMap.set(cursor.toISOString().slice(0, 10), 0);
      cursor.setDate(cursor.getDate() + 1);
    }

    const distributionMap = new Map<string, number>();
    let dataRetrievedBytes = 0;
    let requestCount = 0;

    for (const row of rows) {
      const requests = Number(row.requests || 0);
      const bytes = Number(row.bytes || 0);

      requestCount += requests;
      distributionMap.set(
        row.action,
        (distributionMap.get(row.action) ?? 0) + requests,
      );

      if (row.date && RETRIEVED_ACTIONS.includes(row.action)) {
        dataRetrievedBytes += bytes;
        trafficMap.set(
          row.date,
          (trafficMap.get(row.date) ?? 0) + bytes,
        );
      }
    }

    return json({
      rangeDays: RANGE_DAYS,
      dataRetrievedBytes,
      requestCount,
      traffic: Array.from(trafficMap.entries()).map(([date, retrievedBytes]) => ({
        date,
        retrievedBytes,
      })),
      distribution: Array.from(distributionMap.entries())
        .map(([action, count]) => ({ action, count }))
        .sort((a, b) => b.count - a.count),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}