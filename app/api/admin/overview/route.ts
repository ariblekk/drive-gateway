import { connection } from "next/server";
import { desc } from "drizzle-orm";

import {
  handleRouteError,
  json,
} from "@/lib/api/response";
import { activityLog, getDb } from "@/lib/db";
import { getGlobalStats } from "@/lib/files/service";
import { publicActivity } from "@/lib/serializers";

export async function GET() {
  try {
    await connection();
    const recentActivity = getDb()
      .select()
      .from(activityLog)
      .orderBy(desc(activityLog.createdAt))
      .limit(10)
      .all()
      .map(publicActivity);

    return json({
      stats: getGlobalStats(),
      recentActivity,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
