import { Readable } from "node:stream";

import { getFileById, openFileDownload } from "@/lib/files/service";
import {
  contentDisposition,
  isInlineSafe,
  quoteEtag,
  resolveContentType,
} from "@/lib/preview";

type Disposition = "attachment" | "inline";

export interface DownloadOptions {
  range?: string | null;
  method?: "GET" | "HEAD";
  ifNoneMatch?: string | null;
  disposition?: Disposition;
}

function readHeader(headers: unknown, name: string): string | null {
  if (!headers || typeof headers !== "object") {
    return null;
  }

  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name);
  }

  return (headers as Record<string, string>)[name] ?? null;
}

function etagMatches(ifNoneMatch: string, etag: string): boolean {
  const strip = (value: string) =>
    value.trim().replace(/^W\//, "").replace(/^"|"$/g, "");

  return ifNoneMatch
    .split(",")
    .some((candidate) => strip(candidate) === strip(etag));
}

function buildHeaders(input: {
  name: string;
  mimeType: string | null;
  size: number;
  updatedAt: number;
  etag: string | null;
  upstream: Record<string, string> | Headers | null;
  disposition: Disposition;
}): Headers {
  const headers = new Headers();
  const contentType = resolveContentType(
    readHeader(input.upstream, "content-type"),
    input.mimeType,
    input.name,
  );
  headers.set("Content-Type", contentType);

  const contentRange = readHeader(input.upstream, "content-range");

  if (contentRange) {
    headers.set("Content-Range", contentRange);
  }

  headers.set(
    "Content-Length",
    readHeader(input.upstream, "content-length") ?? String(input.size),
  );
  headers.set("Accept-Ranges", "bytes");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Last-Modified", new Date(input.updatedAt).toUTCString());
  headers.set("Cache-Control", "private, max-age=0, must-revalidate");

  const etag = readHeader(input.upstream, "etag") ?? input.etag;

  if (etag) {
    headers.set("ETag", quoteEtag(etag));
  }

  const inline =
    input.disposition === "inline" && isInlineSafe(contentType);
  headers.set("Content-Disposition", contentDisposition(input.name, inline));

  // Defense in depth: even a mislabelled text payload can't run scripts.
  if (inline && contentType.toLowerCase() !== "application/pdf") {
    headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
  }

  return headers;
}

export function readDownloadOptions(
  request: Request,
  overrides: DownloadOptions = {},
): DownloadOptions {
  return {
    range: request.headers.get("range"),
    ifNoneMatch: request.headers.get("if-none-match"),
    ...overrides,
  };
}

export async function buildDownloadResponse(
  id: string,
  options: DownloadOptions = {},
): Promise<Response> {
  const disposition = options.disposition ?? "attachment";

  if (options.method === "HEAD") {
    const file = getFileById(id);
    const headers = buildHeaders({
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      updatedAt: file.updatedAt,
      etag: file.etag,
      upstream: null,
      disposition,
    });

    const etag = headers.get("ETag");

    if (etag && options.ifNoneMatch && etagMatches(options.ifNoneMatch, etag)) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": "private, max-age=0, must-revalidate",
        },
      });
    }

    return new Response(null, { status: 200, headers });
  }

  const { file, response } = await openFileDownload(
    id,
    options.range,
    disposition === "inline" ? "preview" : "download",
  );

  const headers = buildHeaders({
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    updatedAt: file.updatedAt,
    etag: file.etag,
    upstream: response.headers,
    disposition,
  });

  const etag = headers.get("ETag");

  if (etag && options.ifNoneMatch && etagMatches(options.ifNoneMatch, etag)) {
    response.data.destroy();

    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  }

  const stream = Readable.toWeb(
    response.data as unknown as Readable,
  ) as unknown as ReadableStream<Uint8Array>;

  return new Response(stream, {
    status: response.status === 206 ? 206 : 200,
    headers,
  });
}
