import { handleRouteError, json } from "@/lib/api/response";
import { GatewayError } from "@/lib/errors";
import { getAccountById } from "@/lib/files/service";
import { syncAccountQuota } from "@/lib/google/quota";
import { publicAccount } from "@/lib/serializers";

export async function GET(
  _request: Request,
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

    const updated = await syncAccountQuota(account);

    return json({ account: publicAccount(updated) });
  } catch (error) {
    return handleRouteError(error);
  }
}
