import { handleRouteError, json } from "@/lib/api/response";
import { deleteFilePermanentlyById } from "@/lib/files/service";
import { publicFile } from "@/lib/serializers";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const file = await deleteFilePermanentlyById(id, null);

    return json({ file: publicFile(file) });
  } catch (error) {
    return handleRouteError(error);
  }
}
