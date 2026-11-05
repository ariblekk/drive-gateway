import { eq } from "drizzle-orm";

import { handleRouteError, json } from "@/lib/api/response";
import { apiKeys, getDb } from "@/lib/db";
import { GatewayError } from "@/lib/errors";
import { publicApiKey } from "@/lib/serializers";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = getDb()
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, id))
      .get();

    if (!existing) {
      throw new GatewayError("not_found", "API key not found", 404);
    }

    if (!existing.revokedAt) {
      getDb()
        .update(apiKeys)
        .set({ revokedAt: Date.now() })
        .where(eq(apiKeys.id, id))
        .run();
    }

    const updated = getDb()
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, id))
      .get();

    return json({ apiKey: publicApiKey(updated ?? existing) });
  } catch (error) {
    return handleRouteError(error);
  }
}
