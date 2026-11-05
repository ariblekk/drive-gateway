import crypto from "node:crypto";

import type { Credentials } from "google-auth-library";
import { eq } from "drizzle-orm";

import { encrypt } from "@/lib/crypto";
import { getDb, googleAccounts, type GoogleAccount } from "@/lib/db";

export function upsertGoogleAccount(input: {
  email: string;
  displayName?: string | null;
  pictureUrl?: string | null;
  tokens: Credentials;
}): GoogleAccount {
  const db = getDb();
  const now = Date.now();
  const existing = db
    .select()
    .from(googleAccounts)
    .where(eq(googleAccounts.email, input.email))
    .get();

  const refreshToken = input.tokens.refresh_token
    ? encrypt(input.tokens.refresh_token)
    : existing?.refreshToken;

  if (!refreshToken) {
    throw new Error(
      "Google did not return a refresh token. Please revoke the app's access and connect again.",
    );
  }

  const values = {
    email: input.email,
    displayName: input.displayName ?? null,
    pictureUrl: input.pictureUrl ?? null,
    refreshToken,
    accessToken: input.tokens.access_token
      ? encrypt(input.tokens.access_token)
      : null,
    tokenExpiry: input.tokens.expiry_date ?? null,
    scope: input.tokens.scope ?? null,
    status: "active",
    lastError: null,
    updatedAt: now,
  };

  if (existing) {
    db.update(googleAccounts)
      .set(values)
      .where(eq(googleAccounts.id, existing.id))
      .run();

    return { ...existing, ...values };
  }

  const account: GoogleAccount = {
    id: crypto.randomUUID(),
    provider: "google",
    s3Endpoint: null,
    s3Bucket: null,
    s3Region: "us-east-1",
    s3AccessKeyId: null,
    s3SecretCiphertext: null,
    s3ForcePathStyle: 1,
    quotaLimit: null,
    quotaUsage: 0,
    quotaUsageInDrive: 0,
    lastUsedAt: null,
    lastQuotaSync: null,
    createdAt: now,
    ...values,
  };

  db.insert(googleAccounts).values(account).run();

  return account;
}

export function disconnectGoogleAccount(accountId: string): GoogleAccount {
  const db = getDb();
  const now = Date.now();

  db.update(googleAccounts)
    .set({
      refreshToken: encrypt(""),
      accessToken: null,
      tokenExpiry: null,
      status: "disconnected",
      lastError: "Disconnected",
      updatedAt: now,
    })
    .where(eq(googleAccounts.id, accountId))
    .run();

  const account = db
    .select()
    .from(googleAccounts)
    .where(eq(googleAccounts.id, accountId))
    .get();

  if (!account) {
    throw new Error("Account not found");
  }

  return account;
}
