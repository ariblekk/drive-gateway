import { handleRouteError, json } from "@/lib/api/response";
import { restoreFolder } from "@/lib/folders/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const result = await restoreFolder(id);

    return json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
