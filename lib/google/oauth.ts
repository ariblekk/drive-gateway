import type { Credentials, OAuth2Client } from "google-auth-library";
import { google } from "googleapis";

import { getEnv } from "@/lib/env";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
];

export function createOAuthClient(): OAuth2Client {
  const env = getEnv();

  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );
}

export function buildAuthUrl(state: string): string {
  return createOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: GOOGLE_SCOPES,
    state,
  });
}

export async function exchangeCode(code: string): Promise<Credentials> {
  const { tokens } = await createOAuthClient().getToken(code);
  return tokens;
}

export async function fetchUserInfo(
  tokens: Credentials,
  client: OAuth2Client,
): Promise<{ email: string; name: string | null; picture: string | null }> {
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data } = await oauth2.userinfo.get();

  if (!data.email) {
    throw new Error("Google did not return an email address");
  }

  return {
    email: data.email,
    name: data.name ?? null,
    picture: data.picture ?? null,
  };
}
