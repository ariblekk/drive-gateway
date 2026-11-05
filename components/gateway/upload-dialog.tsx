"use client";

import { useEffect, useRef, useState } from "react";
import {
  IconCheck,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { cn } from "cn";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  apiGet,
  apiUploadFileWithProgress,
  notifyFilesChanged,
  notifyStorageChanged,
  toMessage,
} from "./client";
import { formatBytes } from "./format";

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

type UploadStatus = "pending" | "uploading" | "success" | "error";

interface FileUploadState {
  status: UploadStatus;
  percent: number;
  error?: string;
}

interface FolderOption {
  id: string;
  name: string;
  path: string;
}

export function UploadDialog({
  open,
  onOpenChange,
  defaultFolderId = null,
  defaultBucketId = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultFolderId?: string | null;
  defaultBucketId?: string | null;
}) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [folderId, setFolderId] = useState(defaultFolderId ?? "root");
  const [bucketId, setBucketId] = useState(defaultBucketId ?? "default");
  const [buckets, setBuckets] = useState<Array<{ name: string }>>([]);
  const [folders, setFolders] = useState<FolderOption[] | null>(null);
  const [maxUploadBytes, setMaxUploadBytes] = useState<number | null>(
    null,
  );
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<
    Record<string, FileUploadState>
  >({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;

    apiGet<{ folders: FolderOption[] }>(
      `/api/admin/folders?all=1&status=active&bucketId=${encodeURIComponent(bucketId)}`,
    )
      .then((data) => {
        if (active) {
          setFolders(data.folders);
        }
      })
      .catch(() => {
        if (active) {
          setFolders([]);
        }
      });

    apiGet<{ buckets: Array<{ name: string }> }>("/api/admin/buckets")
      .then((data) => {
        if (active) {
          setBuckets(data.buckets);
        }
      })
      .catch(() => undefined);

    apiGet<{ maxUploadBytes: number }>("/api/admin/config")
      .then((data) => {
        if (active) {
          setMaxUploadBytes(data.maxUploadBytes);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [open, bucketId]);

  const totalSelectedBytes = selectedFiles.reduce(
    (sum, file) => sum + file.size,
    0,
  );

  const addFiles = (incoming: FileList | File[]) => {
    const list = Array.from(incoming);

    if (list.length === 0) {
      return;
    }

    const limit = maxUploadBytes;
    const oversize =
      limit === null
        ? []
        : list.filter((file) => file.size > limit);
    const accepted =
      limit === null
        ? list
        : list.filter((file) => file.size <= limit);

    if (oversize.length > 0 && limit !== null) {
      toast.error(
        oversize.length === 1
          ? `${oversize[0].name} exceeds the ${formatBytes(limit)} limit.`
          : `${oversize.length} file(s) exceed the ${formatBytes(limit)} limit.`,
      );
    }

    if (accepted.length === 0) {
      return;
    }

    setSelectedFiles((current) => {
      const seen = new Set(current.map(fileKey));
      const next = [...current];

      for (const file of accepted) {
        const key = fileKey(file);

        if (!seen.has(key)) {
          seen.add(key);
          next.push(file);
        }
      }

      return next;
    });
  };

  const removeSelectedFile = (index: number) => {
    const file = selectedFiles[index];

    if (!file) {
      return;
    }

    setSelectedFiles((current) =>
      current.filter((_, fileIndex) => fileIndex !== index),
    );
    setUploadProgress((current) => {
      const next = { ...current };
      delete next[fileKey(file)];
      return next;
    });
  };

  const setFileProgress = (
    file: File,
    update: Partial<FileUploadState>,
  ) => {
    setUploadProgress((current) => ({
      ...current,
      [fileKey(file)]: {
        ...(current[fileKey(file)] ?? {
          status: "pending",
          percent: 0,
        }),
        ...update,
      },
    }));
  };

  const upload = async (event: React.FormEvent) => {
    event.preventDefault();

    if (selectedFiles.length === 0) {
      toast.error("Choose at least one file.");
      return;
    }

    if (maxUploadBytes !== null) {
      const oversize = selectedFiles.filter(
        (file) => file.size > maxUploadBytes,
      );

      if (oversize.length > 0) {
        toast.error(
          oversize.length === 1
            ? `${oversize[0].name} exceeds the ${formatBytes(maxUploadBytes)} limit.`
            : `${oversize.length} file(s) exceed the ${formatBytes(maxUploadBytes)} limit.`,
        );
        return;
      }
    }

    const filesToUpload = selectedFiles;
    const initialProgress: Record<string, FileUploadState> = {};

    for (const file of filesToUpload) {
      initialProgress[fileKey(file)] = { status: "pending", percent: 0 };
    }

    setUploadProgress(initialProgress);

    const toastId = toast.loading(
      filesToUpload.length === 1
        ? `Uploading ${filesToUpload[0].name}…`
        : `Uploading ${filesToUpload.length} files… (0/${filesToUpload.length})`,
    );

    setUploading(true);

    const failedFiles: File[] = [];
    const failures: string[] = [];
    let successCount = 0;

    try {
      for (let index = 0; index < filesToUpload.length; index += 1) {
        const file = filesToUpload[index];

        if (filesToUpload.length > 1) {
          toast.loading(
            `Uploading ${filesToUpload.length} files… (${index + 1}/${filesToUpload.length})`,
            { id: toastId },
          );
        }

        try {
          setFileProgress(file, { status: "uploading", percent: 0 });
          await apiUploadFileWithProgress("/api/admin/upload", file, {
            name: file.name,
            folderId: folderId === "root" ? null : folderId,
            bucketId,
            onProgress: (percent) => {
              setFileProgress(file, {
                status: "uploading",
                percent,
              });
            },
          });
          setFileProgress(file, { status: "success", percent: 100 });
          successCount += 1;
        } catch (cause) {
          const message = toMessage(cause);
          failedFiles.push(file);
          failures.push(`${file.name}: ${message}`);
          setFileProgress(file, {
            status: "error",
            percent: 0,
            error: message,
          });
        }
      }

      if (successCount > 0) {
        notifyStorageChanged();
        notifyFilesChanged();
      }

      if (failedFiles.length === 0) {
        setSelectedFiles([]);
        setUploadProgress({});

        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }

        onOpenChange(false);

        toast.success(
          filesToUpload.length === 1
            ? `Uploaded ${filesToUpload[0].name}`
            : `Uploaded ${successCount} files`,
          { id: toastId },
        );
      } else {
        setSelectedFiles(failedFiles);
        setUploadProgress((current) => {
          const next: Record<string, FileUploadState> = {};

          for (const file of failedFiles) {
            const key = fileKey(file);
            next[key] = current[key] ?? {
              status: "error",
              percent: 0,
            };
          }

          return next;
        });

        if (successCount > 0) {
          toast.warning(
            `Uploaded ${successCount} of ${filesToUpload.length} files`,
            {
              id: toastId,
              description: failures.slice(0, 2).join("; "),
            },
          );
        } else {
          toast.error(
            `Upload failed for ${failedFiles.length} file(s)`,
            {
              id: toastId,
              description: failures.slice(0, 2).join("; "),
            },
          );
        }
      }
    } catch (cause) {
      toast.error(toMessage(cause), { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] min-w-0 overflow-x-hidden overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload files</DialogTitle>
          <DialogDescription>
            Drag & drop or choose files. They will be stored on the
            connected account with the most free space.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex min-w-0 flex-col gap-3"
          onSubmit={upload}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => event.preventDefault()}
        >
          <label
            htmlFor="gateway-files"
            onDragEnter={(event) => {
              event.preventDefault();

              if (!uploading) {
                dragCounter.current += 1;
                setIsDragging(true);
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();

              if (!uploading) {
                setIsDragging(true);
              }
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              dragCounter.current = Math.max(
                0,
                dragCounter.current - 1,
              );

              if (dragCounter.current === 0) {
                setIsDragging(false);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              dragCounter.current = 0;
              setIsDragging(false);

              if (!uploading && event.dataTransfer.files.length > 0) {
                addFiles(event.dataTransfer.files);
              }
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-1 border border-dashed p-6 text-center transition-colors",
              isDragging
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted/50",
              uploading && "pointer-events-none opacity-60",
            )}
          >
            <IconUpload className="size-5 text-muted-foreground" />
            <span className="text-sm font-medium">
              Drag & drop files here, or click to browse
            </span>
            <span className="text-xs text-muted-foreground">
              Multiple files supported
            </span>
            <Input
              id="gateway-files"
              ref={fileInputRef}
              type="file"
              multiple
              className="sr-only"
              disabled={uploading}
              onChange={(event) => {
                if (event.target.files) {
                  addFiles(event.target.files);
                }

                event.target.value = "";
              }}
            />
          </label>

          {maxUploadBytes !== null && (
            <p className="text-xs text-muted-foreground">
              Max upload size: {formatBytes(maxUploadBytes)} per file.
            </p>
          )}

          {selectedFiles.length > 0 && (
            <div className="-mx-4 max-h-[40vh] overflow-x-hidden overflow-y-auto px-4">
              <div className="flex flex-col gap-1.5">
                {selectedFiles.map((file, index) => {
                  const state = uploadProgress[fileKey(file)];

                  return (
                    <div
                      key={fileKey(file)}
                      className="flex min-w-0 flex-col gap-1 border border-border px-2 py-1 text-xs"
                    >
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <span
                          className="min-w-0 flex-1 truncate"
                          title={file.name}
                        >
                          {file.name}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {formatBytes(file.size)}
                        </span>
                        {state?.status === "success" && (
                          <IconCheck className="size-3.5 shrink-0 text-emerald-500" />
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Remove ${file.name}`}
                          disabled={uploading}
                          onClick={() => removeSelectedFile(index)}
                        >
                          <IconX />
                        </Button>
                      </div>

                      {state && state.status !== "pending" && (
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <Progress
                              value={
                                state.status === "error"
                                  ? 100
                                  : state.percent
                              }
                              className={cn(
                                "h-1",
                                state.status === "error" &&
                                  "[&_[data-slot=progress-indicator]]:bg-destructive",
                              )}
                            />
                            <span
                              className={cn(
                                "w-12 shrink-0 text-right text-[10px]",
                                state.status === "error"
                                  ? "text-destructive"
                                  : "text-muted-foreground",
                              )}
                            >
                              {state.status === "error"
                                ? "Failed"
                                : state.status === "success"
                                  ? "Done"
                                  : `${state.percent}%`}
                            </span>
                          </div>
                          {state.status === "error" && state.error && (
                            <p
                              className="truncate text-[10px] text-destructive"
                              title={state.error}
                            >
                              {state.error}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium">Bucket</span>
              <Select
                value={bucketId}
                onValueChange={(val) => {
                  setBucketId(val);
                  setFolderId("root");
                }}
              >
                <SelectTrigger className="w-full" disabled={uploading}>
                  <SelectValue placeholder="Bucket" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {buckets.map((b) => (
                      <SelectItem key={b.name} value={b.name}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium">Folder</span>
              <Select value={folderId} onValueChange={setFolderId}>
                <SelectTrigger className="w-full" disabled={uploading}>
                  <SelectValue placeholder="Root" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="root">/ (Root)</SelectItem>
                    {folders?.map((folder) => (
                      <SelectItem key={folder.id} value={folder.id}>
                        {folder.path}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={uploading || selectedFiles.length === 0}
            >
              <IconUpload />
              {uploading
                ? "Uploading…"
                : selectedFiles.length > 1
                  ? `Upload ${selectedFiles.length} files · ${formatBytes(totalSelectedBytes)}`
                  : selectedFiles.length === 1
                    ? `Upload · ${formatBytes(totalSelectedBytes)}`
                    : "Upload"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
