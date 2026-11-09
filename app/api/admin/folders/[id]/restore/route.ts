import { handleRouteError } from "@/lib/api/response";
import { GatewayError } from "@/lib/errors";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await params;
    throw new GatewayError(
      "not_supported",
      "Recycle bin is disabled; deletions are permanent",
      400,
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
