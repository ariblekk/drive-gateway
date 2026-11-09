import { eq } from "drizzle-orm";

import { getDb, googleAccounts, type GoogleAccount } from "@/lib/db";
import { errorMessage } from "@/lib/errors";
import { syncBackendQuota } from "@/lib/storage/backend";

export async function syncAccountQuota(
  account: GoogleAccount,
): Promise<GoogleAccount> {
  return syncBackendQuota(account);
}

export async function syncAllQuotas(): Promise<{
  synced: number;
  failed: Array<{ id: string; email: string; error: string }>;
}> {
  const db = getDb();
  const accounts = db.select().from(googleAccounts).all();
  const failed: Array<{ id: string; email: string; error: string }> = [];
  let synced = 0;

  for (const account of accounts) {
    if (account.status === "disconnected") {
      continue;
    }

    try {
      await syncAccountQuota(account);
      synced += 1;
    } catch (error) {
      const message = errorMessage(error);
      db.update(googleAccounts)
        .set({ status: "error", lastError: message, updatedAt: Date.now() })
        .where(eq(googleAccounts.id, account.id))
        .run();
      failed.push({ id: account.id, email: account.email, error: message });
    }
  }

  return { synced, failed };
}
