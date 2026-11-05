import { eq } from "drizzle-orm";

import { getDb, googleAccounts, type GoogleAccount } from "@/lib/db";
import { getEnv } from "@/lib/env";

const SAFETY_MARGIN_BYTES = 5 * 1024 * 1024;

export function remainingBytes(account: GoogleAccount): number {
  if (account.quotaLimit === null) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Math.max(0, account.quotaLimit - account.quotaUsage);
}

export function rankAccounts(
  accounts: GoogleAccount[],
  sizeBytes: number,
): GoogleAccount[] {
  const strategy = getEnv().ACCOUNT_SELECTION_STRATEGY;
  const needed = sizeBytes + SAFETY_MARGIN_BYTES;

  const eligible = accounts.filter(
    (account) =>
      account.status === "active" && remainingBytes(account) >= needed,
  );

  const byLastUsed = (a: GoogleAccount, b: GoogleAccount) =>
    (a.lastUsedAt ?? 0) - (b.lastUsedAt ?? 0);

  if (strategy === "round_robin") {
    return [...eligible].sort(byLastUsed);
  }

  return [...eligible].sort((a, b) => {
    const difference = remainingBytes(b) - remainingBytes(a);
    return difference !== 0 ? difference : byLastUsed(a, b);
  });
}

export function markAccountUsed(accountId: string): void {
  const now = Date.now();
  getDb()
    .update(googleAccounts)
    .set({ lastUsedAt: now, updatedAt: now })
    .where(eq(googleAccounts.id, accountId))
    .run();
}
