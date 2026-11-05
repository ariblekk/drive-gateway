import { connection } from "next/server";
import { desc, sql } from "drizzle-orm";

import { handleRouteError, json } from "@/lib/api/response";
import { activityLog, getDb, googleAccounts } from "@/lib/db";
import { publicActivity } from "@/lib/serializers";

export async function GET(request: Request) {
  try {
    await connection();
    const { searchParams } = new URL(request.url);
    const limitParam = Number(searchParams.get("limit") ?? 20);
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(Math.trunc(limitParam), 1), 100)
      : 20;
    const offsetParam = Number(searchParams.get("offset") ?? 0);
    const offset = Number.isFinite(offsetParam)
      ? Math.max(Math.trunc(offsetParam), 0)
      : 0;

    const rows = getDb()
      .select()
      .from(activityLog)
      .orderBy(desc(activityLog.createdAt))
      .limit(limit)
      .offset(offset)
      .all();

    const totalRow = getDb()
      .select({ count: sql<number>`count(*)` })
      .from(activityLog)
      .get();

    const accounts = getDb().select().from(googleAccounts).all();
    const accountMap = new Map(accounts.map((account) => [account.id, account]));

    return json({
      activity: rows.map((entry) => ({
        ...publicActivity(entry),
        accountEmail: entry.accountId
          ? (accountMap.get(entry.accountId)?.email ?? null)
          : null,
      })),
      total: Number(totalRow?.count ?? 0),
      limit,
      offset,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
