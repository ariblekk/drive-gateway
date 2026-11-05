import crypto from "node:crypto";

import { connection } from "next/server";
import { desc } from "drizzle-orm";

import { hashApiKey } from "@/lib/api/auth";
import { handleRouteError, json } from "@/lib/api/response";
import { apiKeys, getDb, type ApiKey } from "@/lib/db";
import { GatewayError } from "@/lib/errors";
import { publicApiKey } from "@/lib/serializers";

export async function GET() {
  try {
    await connection();
    const keys = getDb()
      .select()
      .from(apiKeys)
      .orderBy(desc(apiKeys.createdAt))
      .all()
      .map(publicApiKey);

    return json({ apiKeys: keys });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
    } | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!name) {
      throw new GatewayError("bad_request", "name is required", 400);
    }

    const rawKey = `gwk_live_${crypto.randomBytes(24).toString("base64url")}`;
    const now = Date.now();
    const key: ApiKey = {
      id: crypto.randomUUID(),
      name,
      keyHash: hashApiKey(rawKey),
      keyPrefix: rawKey.slice(0, 16),
      lastUsedAt: null,
      revokedAt: null,
      createdAt: now,
    };

    getDb().insert(apiKeys).values(key).run();

    return json(
      {
        apiKey: publicApiKey(key),
        key: rawKey,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
