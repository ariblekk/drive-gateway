import { connection } from "next/server";

import { handleRouteError, json } from "@/lib/api/response";
import { deleteBucket } from "@/lib/s3/buckets";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await connection();
    const { id } = await params;
    deleteBucket(id);

    return json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
