import { handleRouteError } from "@/lib/api/response";
import { deleteFolderPermanently } from "@/lib/folders/service";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await deleteFolderPermanently(id);

    return new Response(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
