import { errorMessage } from "@/lib/errors";

export const STORAGE_CHANGED_EVENT = "gateway:storage-changed";
export const FILES_CHANGED_EVENT = "gateway:files-changed";

export function notifyStorageChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(STORAGE_CHANGED_EVENT));
  }
}

export function notifyFilesChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(FILES_CHANGED_EVENT));
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      window.location.replace(new URL("/login", window.location.origin));
    }

    const message =
      (data as { error?: { message?: string } } | null)?.error?.message ??
      response.statusText ??
      "Request failed";

    throw new ApiError(response.status, message);
  }

  return data as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  return parseResponse<T>(response);
}

export async function apiSend<T>(
  path: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return parseResponse<T>(response);
}

export async function apiUpload<T>(
  path: string,
  formData: FormData,
): Promise<T> {
  const response = await fetch(path, { method: "POST", body: formData });
  return parseResponse<T>(response);
}

export function apiUploadWithProgress<T>(
  path: string,
  formData: FormData,
  onProgress?: (percent: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", path);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(
          Math.min(
            100,
            Math.round((event.loaded / event.total) * 100),
          ),
        );
      }
    };

    xhr.onload = () => {
      let data: unknown = null;

      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = null;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(data as T);
        return;
      }

      if (xhr.status === 401 && typeof window !== "undefined") {
        window.location.replace(
          new URL("/login", window.location.origin),
        );
      }

      const message =
        (data as { error?: { message?: string } } | null)?.error
          ?.message ??
        xhr.statusText ??
        "Request failed";

      reject(new ApiError(xhr.status, message));
    };

    xhr.onerror = () => reject(new ApiError(0, "Network error"));
    xhr.onabort = () => reject(new ApiError(0, "Upload cancelled"));
    xhr.send(formData);
  });
}

interface FileUploadOptions {
  name?: string;
  folderId?: string | null;
  onProgress?: (percent: number) => void;
}

export function apiUploadFileWithProgress<T>(
  path: string,
  file: File,
  options: FileUploadOptions = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams();
    params.set("name", options.name ?? file.name);

    if (options.folderId) {
      params.set("folderId", options.folderId);
    }

    const mimeType = file.type || "application/octet-stream";
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${path}?${params.toString()}`);
    xhr.setRequestHeader("Content-Type", mimeType);
    xhr.setRequestHeader("x-file-type", mimeType);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        options.onProgress?.(
          Math.min(
            100,
            Math.round((event.loaded / event.total) * 100),
          ),
        );
      }
    };

    xhr.onload = () => {
      let data: unknown = null;

      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = null;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        options.onProgress?.(100);
        resolve(data as T);
        return;
      }

      if (xhr.status === 401 && typeof window !== "undefined") {
        window.location.replace(
          new URL("/login", window.location.origin),
        );
      }

      const message =
        (data as { error?: { message?: string } } | null)?.error
          ?.message ??
        xhr.statusText ??
        "Request failed";

      reject(new ApiError(xhr.status, message));
    };

    xhr.onerror = () => reject(new ApiError(0, "Network error"));
    xhr.onabort = () => reject(new ApiError(0, "Upload cancelled"));
    xhr.send(file);
  });
}

export function toMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : errorMessage(error);
}
