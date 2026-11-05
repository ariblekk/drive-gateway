import { handleRouteError, json } from "@/lib/api/response";
import { restoreFileById } from "@/lib/files/service";
import { publicFile } from "@/lib/serializers";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const file = await restoreFileById(id);

    return json({ file: publicFile(file) });
  } catch (error) {
    return handleRouteError(error);
  }
}
