import { eq } from "drizzle-orm";

import { handleRouteError, json } from "@/lib/api/response";
import { getDb, googleAccounts } from "@/lib/db";
import { GatewayError } from "@/lib/errors";
import { disconnectGoogleAccount } from "@/lib/google/accounts";
import { getAccountById } from "@/lib/files/service";
import { publicAccount } from "@/lib/serializers";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const account = getAccountById(id);

    if (account.status === "disconnected") {
      throw new GatewayError(
        "account_disconnected",
        "This account is disconnected",
        409,
      );
    }

    const body = (await request.json().catch(() => null)) as {
      status?: unknown;
    } | null;
    const status = body?.status;

    if (status !== "active" && status !== "paused") {
      throw new GatewayError(
        "bad_request",
        "status must be either 'active' or 'paused'",
        400,
      );
    }

    getDb()
      .update(googleAccounts)
      .set({ status, updatedAt: Date.now() })
      .where(eq(googleAccounts.id, id))
      .run();

    return json({ account: publicAccount(getAccountById(id)) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    getAccountById(id);

    const account = disconnectGoogleAccount(id);

    return json({ account: publicAccount(account) });
  } catch (error) {
    return handleRouteError(error);
  }
}
