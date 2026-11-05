import { handleRouteError, json } from "@/lib/api/response";
import { deleteFilePermanentlyById } from "@/lib/files/service";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await deleteFilePermanentlyById(id);

    return json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
