import { requireApiKey } from "@/lib/api/auth";
import { handleRouteError, json, preflight, withCors } from "@/lib/api/response";
import { deleteFilePermanentlyById, getFileById } from "@/lib/files/service";
import { publicFile } from "@/lib/serializers";

export const OPTIONS = preflight;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireApiKey(request);
    const { id } = await params;
    const file = getFileById(id);

    return withCors(json({ file: publicFile(file) }));
  } catch (error) {
    return withCors(handleRouteError(error));
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const apiKey = await requireApiKey(request);
    const { id } = await params;
    const file = await deleteFilePermanentlyById(id, apiKey.id);

    return withCors(json({ file: publicFile(file) }));
  } catch (error) {
    return withCors(handleRouteError(error));
  }
}
