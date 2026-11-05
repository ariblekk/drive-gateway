import { connection } from "next/server";
import { desc } from "drizzle-orm";

import { handleRouteError, json } from "@/lib/api/response";
import { getDb, googleAccounts } from "@/lib/db";
import { publicAccount } from "@/lib/serializers";

export async function GET() {
  try {
    await connection();
    const accounts = getDb()
      .select()
      .from(googleAccounts)
      .orderBy(desc(googleAccounts.createdAt))
      .all()
      .map(publicAccount);

    return json({ accounts });
  } catch (error) {
    return handleRouteError(error);
  }
}
