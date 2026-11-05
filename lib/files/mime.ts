export type FileCategory = "photos" | "videos" | "documents" | "other";

export interface TypeUsageTotals {
  photos: { bytes: number; count: number };
  videos: { bytes: number; count: number };
  documents: { bytes: number; count: number };
  other: { bytes: number; count: number };
}

export function emptyTypeUsage(): TypeUsageTotals {
  return {
    photos: { bytes: 0, count: 0 },
    videos: { bytes: 0, count: 0 },
    documents: { bytes: 0, count: 0 },
    other: { bytes: 0, count: 0 },
  };
}

export function classifyMimeType(mimeType: string | null): FileCategory {
  const type = (mimeType ?? "").toLowerCase();

  if (type.startsWith("image/")) {
    return "photos";
  }

  if (type.startsWith("video/")) {
    return "videos";
  }

  if (
    type.startsWith("text/") ||
    type === "application/pdf" ||
    type === "application/rtf" ||
    type === "application/json" ||
    type === "application/xml" ||
    type === "application/ld+json" ||
    type.includes("word") ||
    type.includes("excel") ||
    type.includes("spreadsheet") ||
    type.includes("presentation") ||
    type.includes("powerpoint") ||
    type.includes("opendocument")
  ) {
    return "documents";
  }

  return "other";
}
