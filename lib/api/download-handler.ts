import { Readable } from "node:stream";

import { openFileDownload } from "@/lib/files/service";

function readHeader(headers: unknown, name: string): string | null {
  if (!headers || typeof headers !== "object") {
    return null;
  }

  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name);
  }

  return (headers as Record<string, string>)[name] ?? null;
}

export async function buildDownloadResponse(
  id: string,
  range: string | null,
): Promise<Response> {
  const { file, response } = await openFileDownload(id, range);

  const stream = Readable.toWeb(
    response.data as unknown as Readable,
  ) as unknown as ReadableStream<Uint8Array>;

  const headers = new Headers();
  headers.set(
    "Content-Type",
    readHeader(response.headers, "content-type") ??
      file.mimeType ??
      "application/octet-stream",
  );

  const contentRange = readHeader(response.headers, "content-range");

  if (contentRange) {
    headers.set("Content-Range", contentRange);
  }

  headers.set(
    "Content-Length",
    readHeader(response.headers, "content-length") ?? String(file.size),
  );
  headers.set("Accept-Ranges", "bytes");

  const encodedName = encodeURIComponent(file.name);
  headers.set(
    "Content-Disposition",
    `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
  );

  return new Response(stream, {
    status: response.status === 206 ? 206 : 200,
    headers,
  });
}
