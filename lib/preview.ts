// MIME types browsers may render inline. SVG/HTML/JS excluded: they can execute
// scripts on this origin. Shared by app routes and the S3-compatible API.
export function isInlineSafe(contentType: string): boolean {
  const mime = contentType.split(";")[0]?.trim().toLowerCase() ?? "";

  if (mime === "application/pdf" || mime === "text/plain") {
    return true;
  }

  if (mime.startsWith("image/")) {
    return !mime.includes("svg");
  }

  return mime.startsWith("audio/") || mime.startsWith("video/");
}

// Stored/upstream MIME is often application/octet-stream. Infer from extension.
const EXT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  pdf: "application/pdf",
  txt: "text/plain",
  log: "text/plain",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
};

export function resolveContentType(
  upstream: string | null,
  stored: string | null,
  name: string,
): string {
  for (const candidate of [stored, upstream]) {
    const base = candidate?.split(";")[0]?.trim();

    if (base && base.toLowerCase() !== "application/octet-stream") {
      return base;
    }
  }

  const ext = name.split(".").pop()?.toLowerCase() ?? "";

  return EXT_TYPES[ext] ?? "application/octet-stream";
}

export function contentDisposition(filename: string, inline: boolean): string {
  const ascii = filename
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_")
    .slice(0, 200);
  const fallback = ascii || "download";
  const encoded = encodeURIComponent(filename);

  return `${inline ? "inline" : "attachment"}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export function quoteEtag(value: string): string {
  return /^(W\/)?"/.test(value) ? value : `"${value}"`;
}
