import { handleRouteError, json } from "@/lib/api/response";
import { deleteFolderPermanently } from "@/lib/folders/service";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await deleteFolderPermanently(id);

    return json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
