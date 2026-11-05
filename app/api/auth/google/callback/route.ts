import { cookies } from "next/headers";

import { getEnv } from "@/lib/env";
import { errorMessage } from "@/lib/errors";
import { upsertGoogleAccount } from "@/lib/google/accounts";
import {
  createOAuthClient,
  exchangeCode,
  fetchUserInfo,
} from "@/lib/google/oauth";
import { syncAccountQuota } from "@/lib/google/quota";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const appUrl = getEnv().APP_URL;

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("g_oauth_state")?.value;
  cookieStore.delete("g_oauth_state");

  const redirectToAccounts = (params: Record<string, string>) => {
    const target = new URL("/dashboard/accounts", appUrl);

    for (const [key, value] of Object.entries(params)) {
      target.searchParams.set(key, value);
    }

    return Response.redirect(target, 302);
  };

  if (oauthError) {
    return redirectToAccounts({ error: oauthError });
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectToAccounts({ error: "invalid_oauth_state" });
  }

  try {
    const tokens = await exchangeCode(code);

    if (!tokens.refresh_token) {
      throw new Error(
        "Google did not return a refresh token. Revoke the app's access in your Google account and try connecting again.",
      );
    }

    const client = createOAuthClient();
    const profile = await fetchUserInfo(tokens, client);

    const account = upsertGoogleAccount({
      email: profile.email,
      displayName: profile.name,
      pictureUrl: profile.picture,
      tokens,
    });

    await syncAccountQuota(account);

    return redirectToAccounts({ connected: profile.email });
  } catch (error) {
    return redirectToAccounts({
      error: errorMessage(error).slice(0, 300),
    });
  }
}
