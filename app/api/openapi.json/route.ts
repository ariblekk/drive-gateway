import { json } from "@/lib/api/response";
import { openApiSpec } from "@/lib/docs/openapi";

export async function GET() {
  return json(openApiSpec, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
