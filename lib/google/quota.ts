import { eq } from "drizzle-orm";

import { getDb, googleAccounts, type GoogleAccount } from "@/lib/db";
import { errorMessage } from "@/lib/errors";
import { syncS3BackendQuota } from "@/lib/storage/s3-backend";
import { createDriveClient, getAuthorizedClient } from "./client";

export async function syncAccountQuota(
  account: GoogleAccount,
): Promise<GoogleAccount> {
  if (account.provider === "s3") {
    return syncS3BackendQuota(account);
  }

  const auth = await getAuthorizedClient(account);
  const drive = createDriveClient(auth);
  const { data } = await drive.about.get({ fields: "storageQuota" });
  const quota = data.storageQuota;

  const quotaLimit = quota?.limit ? Number(quota.limit) : null;
  const quotaUsage = quota?.usage ? Number(quota.usage) : 0;
  const quotaUsageInDrive = quota?.usageInDrive
    ? Number(quota.usageInDrive)
    : 0;

  const now = Date.now();
  const db = getDb();

  db.update(googleAccounts)
    .set({
      quotaLimit,
      quotaUsage,
      quotaUsageInDrive,
      lastQuotaSync: now,
      status: "active",
      lastError: null,
      updatedAt: now,
    })
    .where(eq(googleAccounts.id, account.id))
    .run();

  return {
    ...account,
    quotaLimit,
    quotaUsage,
    quotaUsageInDrive,
    lastQuotaSync: now,
    status: "active",
    lastError: null,
    updatedAt: now,
  };
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
