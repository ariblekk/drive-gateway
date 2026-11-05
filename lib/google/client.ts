import type { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { eq } from "drizzle-orm";

import { decrypt, encrypt } from "@/lib/crypto";
import { getDb, googleAccounts, type GoogleAccount } from "@/lib/db";
import { createOAuthClient } from "./oauth";

const EXPIRY_SKEW_MS = 60_000;

export async function getAuthorizedClient(
  account: GoogleAccount,
): Promise<OAuth2Client> {
  if (account.status === "disconnected") {
    throw new Error(`Google account ${account.email} is disconnected`);
  }

  const client = createOAuthClient();
  const now = Date.now();

  client.setCredentials({
    refresh_token: decrypt(account.refreshToken),
    access_token: account.accessToken ? decrypt(account.accessToken) : undefined,
    expiry_date: account.tokenExpiry ?? undefined,
    scope: account.scope ?? undefined,
  });

  const needsRefresh =
    !account.accessToken ||
    !account.tokenExpiry ||
    account.tokenExpiry <= now + EXPIRY_SKEW_MS;

  if (needsRefresh) {
    const { credentials } = await client.refreshAccessToken();
    client.setCredentials(credentials);

    const db = getDb();
    db.update(googleAccounts)
      .set({
        accessToken: credentials.access_token
          ? encrypt(credentials.access_token)
          : account.accessToken,
        tokenExpiry: credentials.expiry_date ?? now + 3_600_000,
        updatedAt: now,
      })
      .where(eq(googleAccounts.id, account.id))
      .run();
  }

  return client;
}

export function createDriveClient(auth: OAuth2Client) {
  return google.drive({ version: "v3", auth });
}
