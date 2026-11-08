import { connection } from "next/server";
import { eq, sql } from "drizzle-orm";

import { handleRouteError, json } from "@/lib/api/response";
import { files, getDb } from "@/lib/db";
import { GatewayError } from "@/lib/errors";
import { createBucket, listBuckets } from "@/lib/s3/buckets";

export async function GET() {
  try {
    await connection();
    const allBuckets = listBuckets();
    const stats = getDb()
      .select({
        bucketId: files.bucketId,
        objectCount: sql<number>`count(*)`,
        totalBytes: sql<number>`coalesce(sum(${files.size}), 0)`,
      })
      .from(files)
      .where(eq(files.status, "active"))
      .groupBy(files.bucketId)
      .all();

    const statsMap = new Map(
      stats.map((row) => [
        row.bucketId,
        {
          objectCount: Number(row.objectCount || 0),
          totalBytes: Number(row.totalBytes || 0),
        },
      ]),
    );

    return json({
      buckets: allBuckets.map((bucket) => ({
        id: bucket.id,
        name: bucket.name,
        storageAccountId: bucket.storageAccountId ?? null,
        createdAt: bucket.createdAt,
        objectCount: statsMap.get(bucket.name)?.objectCount ?? 0,
        totalBytes: statsMap.get(bucket.name)?.totalBytes ?? 0,
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await connection();
    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      storageAccountId?: unknown;
    } | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const storageAccountId =
      typeof body?.storageAccountId === "string" && body.storageAccountId.trim()
        ? body.storageAccountId.trim()
        : null;

    if (!name) {
      throw new GatewayError("bad_request", "Bucket name is required", 400);
    }

    const bucket = createBucket(name, storageAccountId);

    return json({ bucket }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
