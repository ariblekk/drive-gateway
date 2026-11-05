import { connection } from "next/server";

import { handleRouteError, json } from "@/lib/api/response";
import { getDb, googleAccounts } from "@/lib/db";
import { listFiles } from "@/lib/files/service";
import { publicFile } from "@/lib/serializers";

export async function GET(request: Request) {
  try {
    await connection();
    const { searchParams } = new URL(request.url);
    const bucketParam = searchParams.get("bucketId");
    const bucketId =
      bucketParam === "all" ? null : (bucketParam ?? "default");

    const result = listFiles({
      bucketId,
      q: searchParams.get("q") ?? undefined,
      status: searchParams.get("status") ?? "all",
      folderId: searchParams.get("folderId") ?? undefined,
      limit: Number(searchParams.get("limit") ?? 100),
      offset: Number(searchParams.get("offset") ?? 0),
    });

    const accounts = getDb().select().from(googleAccounts).all();
    const accountMap = new Map(accounts.map((account) => [account.id, account]));

    return json({
      files: result.files.map((file) => ({
        ...publicFile(file),
        accountEmail: accountMap.get(file.accountId)?.email ?? null,
      })),
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
