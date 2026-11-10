import { handleRouteError, jsonError } from "@/lib/api/response";
import { handleUploadRequest } from "@/lib/api/upload-handler";
import { getSession } from "@/lib/auth/session";

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { Allow: "POST" },
  });
}

export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (!session) {
      return jsonError(401, "unauthorized", "Login required");
    }

    return await handleUploadRequest(request);
  } catch (error) {
    return handleRouteError(error);
  }
}
