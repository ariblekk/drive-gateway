import type { NextApiRequest, NextApiResponse } from "next";
import { handleWebDavRequest } from "@/lib/webdav/handler";

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  return handleWebDavRequest(req, res);
}
