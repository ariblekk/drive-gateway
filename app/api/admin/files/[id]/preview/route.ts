import { downloadRoute } from "@/lib/api/download-route";

export const GET = downloadRoute("GET", { disposition: "inline" });
export const HEAD = downloadRoute("HEAD", { disposition: "inline" });
