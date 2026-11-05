import { handleRouteError, json } from "@/lib/api/response";
import { syncAllQuotas } from "@/lib/google/quota";
import { syncAllTypeUsage } from "@/lib/google/usage";

export async function POST() {
  try {
    const quotas = await syncAllQuotas();
    const typeUsage = await syncAllTypeUsage();

    return json({ ...quotas, typeUsage });
  } catch (error) {
    return handleRouteError(error);
  }
}
