"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  IconArrowsMove,
  IconBrandGoogle,
  IconChevronLeft,
  IconChevronRight,
  IconDatabase,
  IconDotsVertical,
  IconDownload,
  IconFolder,
  IconFolderPlus,
  IconPencil,
  IconPlus,
  IconRestore,
  IconSearch,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { BulkBar } from "./bulk-bar";
import {
  apiGet,
  apiSend,
  FILES_CHANGED_EVENT,
  notifyStorageChanged,
  toMessage,
} from "./client";
import { formatBytes, formatDate } from "./format";
import { useHeader } from "./header-provider";
import { useUploadDialog } from "./upload-provider";
import type {
  Account,
  Breadcrumb as BreadcrumbData,
  BucketItem,
  FileItem,
  FolderItem,
} from "./types";

type FolderFormState =
  | { type: "create" }
  | { type: "rename"; folder: FolderItem }
  | { type: "move"; folder: FolderItem };

interface FolderActionState {
  type: "trash" | "restore" | "purge";
  folder: FolderItem;
}

const PAGE_SIZE = 20;

type FileBulkAction = "trash" | "restore" | "purge";

export function FilesView({
  mode = "active",
}: {
  mode?: "active" | "trashed";
} = {}) {
  const isTrash = mode === "trashed";
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState<FolderItem[] | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbData[]>([]);
  const [files, setFiles] = useState<FileItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(
    new Set(),
  );
  const [fileToDelete, setFileToDelete] = useState<FileItem | null>(null);
  const [deletePermanently, setDeletePermanently] = useState(false);
  const [folderForm, setFolderForm] = useState<FolderFormState | null>(null);
  const [folderName, setFolderName] = useState("");
  const [folderParent, setFolderParent] = useState("root");
  const [folderAction, setFolderAction] = useState<FolderActionState | null>(
    null,
  );
  const [moveFilesOpen, setMoveFilesOpen] = useState(false);
  const [moveFolderId, setMoveFolderId] = useState("root");
  const [allFolders, setAllFolders] = useState<FolderItem[]>([]);
  const [buckets, setBuckets] = useState<BucketItem[]>([]);
  const selectedBucket = useSyncExternalStore(
    (callback) => {
      window.addEventListener("storage", callback);
      window.addEventListener("drive:bucket-change", callback);
      return () => {
        window.removeEventListener("storage", callback);
        window.removeEventListener("drive:bucket-change", callback);
      };
    },
    () => localStorage.getItem("drive:selected-bucket") ?? "default",
    () => "default",
  );
  const bucketRestored = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [newBucketOpen, setNewBucketOpen] = useState(false);
  const [newBucketName, setNewBucketName] = useState("");
  const [creatingBucket, setCreatingBucket] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [useSpecificStorage, setUseSpecificStorage] = useState(false);
  const [selectedStorageAccountId, setSelectedStorageAccountId] =
    useState<string>("");
  const [deletingBucket, setDeletingBucket] = useState(false);
  const [deleteBucketOpen, setDeleteBucketOpen] = useState(false);
  const [purgeSelectedOpen, setPurgeSelectedOpen] = useState(false);
  const { openUploadDialog } = useUploadDialog();
  const { setActions, setCount, setCustomTitle } = useHeader();

  const fetchBuckets = useCallback(async () => {
    return apiGet<{ buckets: BucketItem[] }>("/api/admin/buckets");
  }, []);

  const fetchFolders = useCallback(async () => {
    const bucketParam = `&bucketId=${encodeURIComponent(selectedBucket)}`;
    if (isTrash) {
      return apiGet<{
        folders: FolderItem[];
        breadcrumbs: BreadcrumbData[];
      }>(`/api/admin/folders?all=1&status=trashed${bucketParam}`);
    }

    return apiGet<{
      folders: FolderItem[];
      breadcrumbs: BreadcrumbData[];
    }>(
      `/api/admin/folders?parentId=${encodeURIComponent(
        currentFolderId ?? "root",
      )}&status=active${bucketParam}`,
    );
  }, [currentFolderId, isTrash, selectedBucket]);

  const fetchFiles = useCallback(
    (query: string) => {
      const params = new URLSearchParams();
      params.set("status", mode);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));
      params.set("bucketId", selectedBucket);

      if (!isTrash) {
        params.set("folderId", currentFolderId ?? "root");
      }

      if (query) {
        params.set("q", query);
      }

      return apiGet<{ files: FileItem[]; total: number }>(
        `/api/admin/files?${params.toString()}`,
      );
    },
    [currentFolderId, isTrash, mode, offset, selectedBucket],
  );

  const load = useCallback(async () => {
    const [folderData, fileData, bucketData] = await Promise.all([
      fetchFolders(),
      fetchFiles(appliedQ),
      fetchBuckets(),
    ]);

    setFolders(folderData.folders);
    setBreadcrumbs(folderData.breadcrumbs);
    setFiles(fileData.files);
    setTotal(fileData.total);
    setBuckets(bucketData.buckets);
  }, [fetchFolders, fetchFiles, fetchBuckets, appliedQ]);

  useEffect(() => {
    if (!bucketRestored) return;

    let active = true;

    Promise.all([fetchFolders(), fetchFiles(appliedQ), fetchBuckets()])
      .then(([folderData, fileData, bucketData]) => {
        if (active) {
          setFolders(folderData.folders);
          setBreadcrumbs(folderData.breadcrumbs);
          setFiles(fileData.files);
          setTotal(fileData.total);
          setBuckets(bucketData.buckets);
        }
      })
      .catch((cause) => {
        if (active) {
          setError(toMessage(cause));
        }
      });

    return () => {
      active = false;
    };
  }, [fetchFolders, fetchFiles, fetchBuckets, appliedQ, bucketRestored]);

  useEffect(() => {
    const reload = () => {
      load().catch((cause) => setError(toMessage(cause)));
    };

    window.addEventListener(FILES_CHANGED_EVENT, reload);

    return () => {
      window.removeEventListener(FILES_CHANGED_EVENT, reload);
    };
  }, [load]);

  const fetchAllFolders = useCallback(async () => {
    const data = await apiGet<{ folders: FolderItem[] }>(
      `/api/admin/folders?all=1&status=active&bucketId=${encodeURIComponent(selectedBucket)}`,
    );
    setAllFolders(data.folders);
    return data.folders;
  }, [selectedBucket]);

  const switchBucket = (name: string) => {
    localStorage.setItem("drive:selected-bucket", name);
    window.dispatchEvent(new Event("drive:bucket-change"));
    setCurrentFolderId(null);
    clearSelection();
    setQ("");
    setAppliedQ("");
    setOffset(0);
  };

  const handleDeleteBucket = async () => {
    if (selectedBucket === "default") return;

    setDeletingBucket(true);
    try {
      await apiSend(
        `/api/admin/buckets/${encodeURIComponent(selectedBucket)}`,
        "DELETE",
      );
      toast.success(`Bucket "${selectedBucket}" deleted.`);
      setDeleteBucketOpen(false);
      switchBucket("default");
      setBuckets((current) =>
        current.filter((bucket) => bucket.name !== selectedBucket),
      );
      setCurrentFolderId(null);
    } catch (cause) {
      toast.error(toMessage(cause));
    } finally {
      setDeletingBucket(false);
    }
  };

  const handleCreateBucket = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newBucketName.trim().toLowerCase();

    if (!name) {
      toast.error("Bucket name is required.");
      return;
    }

    setCreatingBucket(true);

    try {
      const storageAccountId =
        useSpecificStorage && selectedStorageAccountId
          ? selectedStorageAccountId
          : null;
      await apiSend("/api/admin/buckets", "POST", { name, storageAccountId });
      toast.success(`Bucket "${name}" created.`);
      setNewBucketName("");
      setUseSpecificStorage(false);
      setNewBucketOpen(false);
      const bData = await fetchBuckets();
      setBuckets(bData.buckets);
      switchBucket(name);
    } catch (cause) {
      toast.error(toMessage(cause));
    } finally {
      setCreatingBucket(false);
    }
  };

  useEffect(() => {
    if (newBucketOpen && accounts.length === 0) {
      apiGet<{ accounts: Account[] }>("/api/admin/accounts")
        .then((res) => {
          const activeAccounts = res.accounts.filter(
            (a) => a.status === "active",
          );
          setAccounts(activeAccounts);
          if (activeAccounts.length > 0) {
            setSelectedStorageAccountId(activeAccounts[0].id);
          }
        })
        .catch(() => undefined);
    }
  }, [newBucketOpen, accounts.length]);

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectedFolderIds(new Set());
  };

  const navigateTo = (folderId: string | null) => {
    setCurrentFolderId(folderId);
    clearSelection();
    setQ("");
    setAppliedQ("");
    setOffset(0);
  };

  const applySearch = () => {
    setAppliedQ(q.trim());
    clearSelection();
    setOffset(0);
  };

  const goToOffset = (next: number) => {
    setOffset(Math.max(0, next));
    clearSelection();
  };

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }

      return next;
    });
  };

  const toggleFolderSelected = (id: string, checked: boolean) => {
    setSelectedFolderIds((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }

      return next;
    });
  };

  const visibleFolders = folders
    ? appliedQ
      ? folders.filter((folder) =>
          folder.name.toLowerCase().includes(appliedQ.toLowerCase()),
        )
      : folders
    : [];

  const selectedCount = selectedIds.size + selectedFolderIds.size;

  const allFilesSelected =
    files === null ||
    files.length === 0 ||
    files.every((file) => selectedIds.has(file.id));
  const allFoldersSelected =
    visibleFolders.length === 0 ||
    visibleFolders.every((folder) => selectedFolderIds.has(folder.id));
  const allSelected =
    ((files?.length ?? 0) > 0 || visibleFolders.length > 0) &&
    allFilesSelected &&
    allFoldersSelected;
  const someSelected =
    (files?.some((file) => selectedIds.has(file.id)) ?? false) ||
    visibleFolders.some((folder) => selectedFolderIds.has(folder.id));

  const toggleAll = (checked: boolean) => {
    setSelectedIds(
      checked ? new Set((files ?? []).map((file) => file.id)) : new Set(),
    );
    setSelectedFolderIds(
      checked ? new Set(visibleFolders.map((folder) => folder.id)) : new Set(),
    );
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(
    Math.max(1, Math.floor(offset / PAGE_SIZE) + 1),
    totalPages,
  );

  const deleteSelected = async () => {
    if (!fileToDelete) {
      return;
    }

    const name = fileToDelete.name;
    const endpoint = deletePermanently
      ? `/api/admin/files/${fileToDelete.id}/permanent`
      : `/api/admin/files/${fileToDelete.id}`;

    setBusyId(fileToDelete.id);
    setError(null);

    try {
      await apiSend(endpoint, "DELETE");
      await load();
      notifyStorageChanged();
      toast.success(
        deletePermanently
          ? `Permanently deleted ${name}`
          : `Moved ${name} to trash`,
      );
      setFileToDelete(null);
    } catch (cause) {
      toast.error(toMessage(cause));
    } finally {
      setBusyId(null);
    }
  };

  const restoreFile = async (file: FileItem) => {
    setBusyId(file.id);
    setError(null);

    try {
      await apiSend(`/api/admin/files/${file.id}/restore`, "POST");
      await load();
      notifyStorageChanged();
      toast.success(`Restored ${file.name}`);
    } catch (cause) {
      toast.error(toMessage(cause));
    } finally {
      setBusyId(null);
    }
  };

  const runBulk = async (action: FileBulkAction) => {
    const fileIds = Array.from(selectedIds);
    const folderIds = Array.from(selectedFolderIds);
    const count = fileIds.length + folderIds.length;

    if (count === 0) {
      return;
    }

    const loadingLabel =
      action === "trash"
        ? "Moving"
        : action === "restore"
          ? "Restoring"
          : "Deleting";
    const toastId = toast.loading(`${loadingLabel} ${count} item(s)…`);

    setBusyId("bulk");

    try {
      const fileRequests = fileIds.map((id) => {
        if (action === "trash") {
          return apiSend(`/api/admin/files/${id}`, "DELETE");
        }

        if (action === "restore") {
          return apiSend(`/api/admin/files/${id}/restore`, "POST");
        }

        return apiSend(`/api/admin/files/${id}/permanent`, "DELETE");
      });

      const folderRequests = folderIds.map((id) => {
        if (action === "trash") {
          return apiSend(`/api/admin/folders/${id}`, "DELETE");
        }

        if (action === "restore") {
          return apiSend(`/api/admin/folders/${id}/restore`, "POST");
        }

        return apiSend(`/api/admin/folders/${id}/permanent`, "DELETE");
      });

      const results = await Promise.allSettled([
        ...fileRequests,
        ...folderRequests,
      ]);
      const failed = results.filter(
        (result) => result.status === "rejected",
      ).length;
      const succeeded = count - failed;

      clearSelection();
      await load();
      notifyStorageChanged();

      if (failed === 0) {
        toast.success(
          action === "trash"
            ? `${succeeded} item(s) moved to trash`
            : action === "restore"
              ? `${succeeded} item(s) restored`
              : `${succeeded} item(s) deleted permanently`,
          { id: toastId },
        );
      } else {
        toast.warning(`${succeeded} succeeded, ${failed} failed`, {
          id: toastId,
        });
      }
    } catch (cause) {
      toast.error(toMessage(cause), { id: toastId });
    } finally {
      setBusyId(null);
    }
  };

  const openMoveFiles = async () => {
    if (selectedCount === 0) {
      return;
    }

    setMoveFolderId("root");
    setMoveFilesOpen(true);

    try {
      await fetchAllFolders();
    } catch (cause) {
      toast.error(toMessage(cause));
    }
  };

  const openMoveSingle = async (file: FileItem) => {
    setSelectedIds(new Set([file.id]));
    setSelectedFolderIds(new Set());
    setMoveFolderId("root");
    setMoveFilesOpen(true);

    try {
      await fetchAllFolders();
    } catch (cause) {
      toast.error(toMessage(cause));
    }
  };

  const submitMoveFiles = async () => {
    const fileIds = Array.from(selectedIds);
    const folderIds = Array.from(selectedFolderIds);

    if (fileIds.length === 0 && folderIds.length === 0) {
      return;
    }

    setBusyId("bulk");

    try {
      const destination = moveFolderId === "root" ? null : moveFolderId;
      let moved = 0;
      let failed = 0;

      if (fileIds.length > 0) {
        try {
          const data = await apiSend<{ moved: number }>(
            "/api/admin/files/move",
            "POST",
            { ids: fileIds, folderId: destination },
          );
          moved += data.moved;
        } catch {
          failed += fileIds.length;
        }
      }

      if (folderIds.length > 0) {
        const results = await Promise.allSettled(
          folderIds.map((id) =>
            apiSend(`/api/admin/folders/${id}`, "PATCH", {
              parentId: destination,
            }),
          ),
        );

        for (const result of results) {
          if (result.status === "fulfilled") {
            moved += 1;
          } else {
            failed += 1;
          }
        }
      }

      clearSelection();
      setMoveFilesOpen(false);
      await load();
      notifyStorageChanged();

      if (failed === 0) {
        toast.success(`Moved ${moved} item(s)`);
      } else {
        toast.warning(`${moved} moved, ${failed} failed`);
      }
    } catch (cause) {
      toast.error(toMessage(cause));
    } finally {
      setBusyId(null);
    }
  };

  const openFolderForm = useCallback(
    async (form: FolderFormState) => {
      setFolderForm(form);
      setFolderName(
        form.type === "rename" && form.folder ? form.folder.name : "",
      );
      setFolderParent(
        form.type === "move" && form.folder
          ? (form.folder.parentId ?? "root")
          : "root",
      );

      if (form.type === "move") {
        try {
          await fetchAllFolders();
        } catch (cause) {
          toast.error(toMessage(cause));
        }
      }
    },
    [fetchAllFolders],
  );

  useEffect(() => {
    if (isTrash) {
      setActions(null);
      return;
    }

    setActions(
      <ButtonGroup>
        <Button
          variant="outline"
          aria-label="New folder"
          onClick={() => void openFolderForm({ type: "create" })}
        >
          <IconFolderPlus />
          <span className="hidden sm:inline">New folder</span>
        </Button>
        <Button
          aria-label="Upload"
          onClick={() => openUploadDialog(currentFolderId, selectedBucket)}
        >
          <IconUpload />
          <span className="hidden sm:inline">Upload</span>
        </Button>
      </ButtonGroup>,
    );

    return () => {
      setActions(null);
    };
  }, [
    isTrash,
    currentFolderId,
    selectedBucket,
    openUploadDialog,
    openFolderForm,
    setActions,
  ]);

  const currentFolder = breadcrumbs[breadcrumbs.length - 1];

  useEffect(() => {
    if (files !== null) {
      setCount(total);
    }
    return () => {
      setCount(null);
    };
  }, [files, total, setCount]);

  useEffect(() => {
    if (!isTrash) {
      if (currentFolder) {
        setCustomTitle(currentFolder.name);
      } else if (selectedBucket !== "default") {
        setCustomTitle(selectedBucket);
      } else {
        setCustomTitle(null);
      }
    } else {
      setCustomTitle(null);
    }
    return () => {
      setCustomTitle(null);
    };
  }, [isTrash, currentFolder, selectedBucket, setCustomTitle]);

  const submitFolderForm = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!folderForm) {
      return;
    }

    try {
      if (folderForm.type === "create") {
        if (!folderName.trim()) {
          toast.error("Folder name is required.");
          return;
        }

        await apiSend("/api/admin/folders", "POST", {
          name: folderName.trim(),
          parentId: currentFolderId,
          bucketId: selectedBucket,
        });
        toast.success("Folder created");
      } else if (folderForm.type === "rename") {
        if (!folderName.trim()) {
          toast.error("Folder name is required.");
          return;
        }

        await apiSend(`/api/admin/folders/${folderForm.folder.id}`, "PATCH", {
          name: folderName.trim(),
        });
        toast.success("Folder renamed");
      } else {
        await apiSend(`/api/admin/folders/${folderForm.folder.id}`, "PATCH", {
          parentId: folderParent === "root" ? null : folderParent,
        });
        toast.success("Folder moved");
      }

      if (folderForm.type === "move") {
        setSelectedFolderIds((current) => {
          const next = new Set(current);
          next.delete(folderForm.folder.id);
          return next;
        });
      }

      setFolderForm(null);
      await load();
    } catch (cause) {
      toast.error(toMessage(cause));
    }
  };

  const runFolderAction = async () => {
    if (!folderAction) {
      return;
    }

    const { type, folder } = folderAction;
    setBusyId(folder.id);

    try {
      if (type === "trash") {
        await apiSend(`/api/admin/folders/${folder.id}`, "DELETE");
        toast.success(`Moved ${folder.name} to trash`);
      } else if (type === "restore") {
        await apiSend(`/api/admin/folders/${folder.id}/restore`, "POST");
        toast.success(`Restored ${folder.name}`);
      } else {
        await apiSend(`/api/admin/folders/${folder.id}/permanent`, "DELETE");
        toast.success(`Deleted ${folder.name} permanently`);
      }

      setSelectedFolderIds((current) => {
        const next = new Set(current);
        next.delete(folder.id);
        return next;
      });
      setFolderAction(null);
      await load();
      notifyStorageChanged();
    } catch (cause) {
      toast.error(toMessage(cause));
    } finally {
      setBusyId(null);
    }
  };

  const deleting = fileToDelete !== null && busyId === fileToDelete.id;
  const editingFolder =
    folderForm && "folder" in folderForm ? folderForm.folder : null;

  const isLoading = folders === null || files === null;
  const hasItems = visibleFolders.length > 0 || (files && files.length > 0);

  return (
    <div
      className={`flex flex-col gap-4${
        selectedCount > 0 ? " pb-24 sm:pb-16" : ""
      }`}
    >
      {!isTrash && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-medium text-muted-foreground">Bucket:</span>
              <Select value={selectedBucket} onValueChange={switchBucket}>
                <SelectTrigger className="w-[180px]">
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
            {selectedBucket !== "default" && (
              <Button
                variant="destructive"
                onClick={() => setDeleteBucketOpen(true)}
              >
                <IconTrash className="size-3.5" />
                <span className="hidden sm:inline">Delete bucket</span>
              </Button>
            )}
            <Button variant="outline" onClick={() => setNewBucketOpen(true)}>
              <IconPlus className="size-3.5" />
              <span className="hidden sm:inline">New bucket</span>
            </Button>
          </div>

          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                {breadcrumbs.length === 0 ? (
                  <BreadcrumbPage>Root</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <button
                      type="button"
                      onClick={() => navigateTo(null)}
                      className="cursor-pointer"
                    >
                      Root
                    </button>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {breadcrumbs.map((crumb, index) => {
                const isLast = index === breadcrumbs.length - 1;
                return (
                  <span
                    key={crumb.id}
                    className="inline-flex items-center gap-1.5"
                  >
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      {isLast ? (
                        <BreadcrumbPage>{crumb.name}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink asChild>
                          <button
                            type="button"
                            onClick={() => navigateTo(crumb.id)}
                            className="cursor-pointer"
                          >
                            {crumb.name}
                          </button>
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  </span>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      )}

      <Card>
        <CardContent className="flex flex-col gap-3">
          {error && (
            <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applySearch();
                }
              }}
              placeholder="Search by name"
            />
            <Button variant="outline" size="sm" onClick={applySearch}>
              <IconSearch />
              Search
            </Button>
          </div>

          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !hasItems ? (
            <p className="text-xs text-muted-foreground">
              {appliedQ ? "No results found." : "No files or folders found."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      checked={
                        allSelected
                          ? true
                          : someSelected
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={(value) => toggleAll(Boolean(value))}
                      aria-label="Select all files"
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Folder</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleFolders.map((folder) => (
                  <TableRow key={`folder-${folder.id}`}>
                    <TableCell>
                      <Checkbox
                        checked={selectedFolderIds.has(folder.id)}
                        onCheckedChange={(value) =>
                          toggleFolderSelected(folder.id, Boolean(value))
                        }
                        aria-label={`Select ${folder.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className="flex min-w-0 items-center gap-2 text-left hover:underline disabled:cursor-default disabled:no-underline"
                        onClick={() => {
                          if (!isTrash) {
                            navigateTo(folder.id);
                          }
                        }}
                        disabled={isTrash}
                      >
                        <IconFolder className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate font-medium">
                          {folder.name}
                        </span>
                      </button>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      —
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      —
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {folder.path}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          folder.status === "active"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {folder.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(folder.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Actions for ${folder.name}`}
                              disabled={busyId === folder.id}
                            >
                              <IconDotsVertical />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-48">
                            {!isTrash && (
                              <>
                                <DropdownMenuItem
                                  onSelect={() =>
                                    void openFolderForm({
                                      type: "rename",
                                      folder,
                                    })
                                  }
                                  disabled={busyId === folder.id}
                                >
                                  <IconPencil />
                                  Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() =>
                                    void openFolderForm({
                                      type: "move",
                                      folder,
                                    })
                                  }
                                  disabled={busyId === folder.id}
                                >
                                  <IconArrowsMove />
                                  Move
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onSelect={() =>
                                    setFolderAction({
                                      type: "trash",
                                      folder,
                                    })
                                  }
                                  disabled={busyId === folder.id}
                                >
                                  <IconTrash />
                                  Move to trash
                                </DropdownMenuItem>
                              </>
                            )}
                            {isTrash && (
                              <>
                                <DropdownMenuItem
                                  onSelect={() =>
                                    setFolderAction({
                                      type: "restore",
                                      folder,
                                    })
                                  }
                                  disabled={busyId === folder.id}
                                >
                                  <IconRestore />
                                  Restore
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onSelect={() =>
                                    setFolderAction({
                                      type: "purge",
                                      folder,
                                    })
                                  }
                                  disabled={busyId === folder.id}
                                >
                                  <IconTrash />
                                  Delete permanently
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {files?.map((file) => (
                  <TableRow key={file.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(file.id)}
                        onCheckedChange={(value) =>
                          toggleSelected(file.id, Boolean(value))
                        }
                        aria-label={`Select ${file.name}`}
                      />
                    </TableCell>
                    <TableCell className="max-w-64 truncate font-medium">
                      {file.name}
                    </TableCell>
                    <TableCell>{formatBytes(file.size)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {file.accountEmail ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {file.path}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          file.status === "active" ? "secondary" : "outline"
                        }
                      >
                        {file.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(file.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Actions for ${file.name}`}
                              disabled={busyId === file.id}
                            >
                              <IconDotsVertical />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-48">
                            {!isTrash && (
                              <>
                                <DropdownMenuItem asChild>
                                  <a
                                    href={`/api/admin/files/${file.id}/download`}
                                    onClick={() =>
                                      toast.info(`Downloading ${file.name}`)
                                    }
                                  >
                                    <IconDownload />
                                    Download
                                  </a>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() => void openMoveSingle(file)}
                                  disabled={busyId === file.id}
                                >
                                  <IconArrowsMove />
                                  Move to folder
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onSelect={() => {
                                    setDeletePermanently(false);
                                    setFileToDelete(file);
                                  }}
                                  disabled={busyId === file.id}
                                >
                                  <IconTrash />
                                  Move to trash
                                </DropdownMenuItem>
                              </>
                            )}
                            {isTrash && (
                              <>
                                <DropdownMenuItem
                                  onSelect={() => void restoreFile(file)}
                                  disabled={busyId === file.id}
                                >
                                  <IconRestore />
                                  Restore
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onSelect={() => {
                                    setDeletePermanently(true);
                                    setFileToDelete(file);
                                  }}
                                  disabled={busyId === file.id}
                                >
                                  <IconTrash />
                                  Delete permanently
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {files !== null && total > 0 && (
            <div className="flex flex-col gap-2 border-t border-border pt-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>
                {`${Math.min(offset + 1, total)}–${Math.min(
                  offset + PAGE_SIZE,
                  total,
                )} of ${total}`}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToOffset(offset - PAGE_SIZE)}
                  disabled={offset === 0}
                >
                  <IconChevronLeft />
                  Previous
                </Button>
                <span>
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToOffset(offset + PAGE_SIZE)}
                  disabled={offset + PAGE_SIZE >= total}
                >
                  Next
                  <IconChevronRight />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={folderForm !== null}
        onOpenChange={(open) => {
          if (!open) {
            setFolderForm(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {folderForm?.type === "create"
                ? "New folder"
                : folderForm?.type === "rename"
                  ? "Rename folder"
                  : "Move folder"}
            </DialogTitle>
            <DialogDescription>
              {folderForm?.type === "create"
                ? "Create a folder inside the current folder."
                : folderForm?.type === "rename"
                  ? "Enter a new folder name."
                  : "Choose a destination folder."}
            </DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-3" onSubmit={submitFolderForm}>
            {folderForm?.type === "move" ? (
              <Select value={folderParent} onValueChange={setFolderParent}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Destination" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="root">/ (Root)</SelectItem>
                    {allFolders
                      .filter((folder) => folder.id !== editingFolder?.id)
                      .map((folder) => (
                        <SelectItem key={folder.id} value={folder.id}>
                          {folder.path}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
                placeholder="Folder name"
                autoFocus
              />
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit">
                {folderForm?.type === "create"
                  ? "Create"
                  : folderForm?.type === "rename"
                    ? "Rename"
                    : "Move"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={moveFilesOpen} onOpenChange={setMoveFilesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move {selectedCount} item(s)</DialogTitle>
            <DialogDescription>Choose a destination folder.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Select value={moveFolderId} onValueChange={setMoveFolderId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Destination" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="root">/ (Root)</SelectItem>
                  {allFolders
                    .filter((folder) => !selectedFolderIds.has(folder.id))
                    .map((folder) => (
                      <SelectItem key={folder.id} value={folder.id}>
                        {folder.path}
                      </SelectItem>
                    ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setMoveFilesOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void submitMoveFiles()}
                disabled={busyId === "bulk"}
              >
                Move
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={folderAction !== null}
        onOpenChange={(open) => {
          if (!open) {
            setFolderAction(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {folderAction?.type === "trash"
                ? "Move folder to trash?"
                : folderAction?.type === "restore"
                  ? "Restore folder?"
                  : "Delete folder permanently?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {folderAction?.type === "trash"
                ? `"${folderAction.folder.name}" and its contents will be moved to Google Drive trash.`
                : folderAction?.type === "restore"
                  ? `"${folderAction.folder.name}" and its contents will be restored.`
                  : `"${folderAction?.folder.name}" and its contents will be permanently deleted from Google Drive. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId === folderAction?.folder.id}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant={
                folderAction?.type === "restore" ? "default" : "destructive"
              }
              disabled={busyId === folderAction?.folder.id}
              onClick={(event) => {
                event.preventDefault();
                void runFolderAction();
              }}
            >
              {busyId === folderAction?.folder.id
                ? "Working…"
                : folderAction?.type === "trash"
                  ? "Move to trash"
                  : folderAction?.type === "restore"
                    ? "Restore"
                    : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={fileToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setFileToDelete(null);
            setDeletePermanently(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deletePermanently ? "Delete permanently?" : "Move to trash?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deletePermanently
                ? `"${fileToDelete?.name}" will be permanently deleted from Google Drive. This action cannot be undone.`
                : `"${fileToDelete?.name}" will be moved to Google Drive trash. You can restore it later from Recycle Bin.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void deleteSelected();
              }}
            >
              {deleting
                ? deletePermanently
                  ? "Deleting…"
                  : "Moving…"
                : deletePermanently
                  ? "Delete permanently"
                  : "Move to trash"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BulkBar
        selectedCount={selectedCount}
        busy={busyId === "bulk"}
        onClear={clearSelection}
      >
        {!isTrash && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void openMoveFiles()}
              disabled={busyId === "bulk"}
            >
              <IconArrowsMove />
              Move to…
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void runBulk("trash")}
              disabled={busyId === "bulk"}
              aria-label="Move to trash"
              title="Move to trash"
            >
              <IconTrash />
              <span className="hidden sm:inline">Move to trash</span>
            </Button>
          </>
        )}
        {isTrash && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void runBulk("restore")}
              disabled={busyId === "bulk"}
              aria-label="Restore"
              title="Restore"
            >
              <IconRestore />
              <span className="hidden sm:inline">Restore</span>
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setPurgeSelectedOpen(true)}
              disabled={busyId === "bulk"}
              aria-label="Delete permanently"
              title="Delete permanently"
            >
              <IconTrash />
              <span className="hidden sm:inline">Delete permanently</span>
            </Button>
          </>
        )}
      </BulkBar>
      <AlertDialog open={purgeSelectedOpen} onOpenChange={setPurgeSelectedOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedCount} item(s) permanently?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the selected files and folders. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId === "bulk"}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busyId === "bulk"}
              onClick={(event) => {
                event.preventDefault();
                setPurgeSelectedOpen(false);
                void runBulk("purge");
              }}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={deleteBucketOpen} onOpenChange={setDeleteBucketOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete bucket “{selectedBucket}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Bucket yang masih berisi file/folder atau terhubung ke kredensial
              S3 aktif tidak dapat dihapus. Kosongkan bucket dan nonaktifkan
              kredensialnya terlebih dahulu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingBucket}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deletingBucket}
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteBucket();
              }}
            >
              {deletingBucket ? "Deleting…" : "Delete bucket"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={newBucketOpen} onOpenChange={setNewBucketOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create bucket</DialogTitle>
            <DialogDescription>
              Enter an S3 bucket name (3–63 characters, lowercase letters,
              numbers, and hyphens).
            </DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={handleCreateBucket}>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="new-bucket-name" className="text-xs font-medium">
                Bucket name
              </label>
              <Input
                id="new-bucket-name"
                value={newBucketName}
                onChange={(event) => setNewBucketName(event.target.value)}
                placeholder="my-new-bucket"
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-2.5 border border-border p-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
                <Checkbox
                  checked={useSpecificStorage}
                  onCheckedChange={(checked) =>
                    setUseSpecificStorage(Boolean(checked))
                  }
                />
                <span>Use specific storage account</span>
              </label>
              {useSpecificStorage && (
                <div className="flex flex-col gap-1.5 pt-1">
                  {accounts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No active storage accounts available.
                    </p>
                  ) : (
                    <Select
                      value={selectedStorageAccountId}
                      onValueChange={setSelectedStorageAccountId}
                    >
                      <SelectTrigger className="w-full text-xs">
                        <SelectValue placeholder="Select storage account" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {accounts.map((acc) => (
                            <SelectItem key={acc.id} value={acc.id}>
                              <div className="flex items-center gap-2">
                                {acc.provider === "s3" ? (
                                  <IconDatabase className="size-3.5 text-blue-500" />
                                ) : (
                                  <IconBrandGoogle className="size-3.5 text-amber-500" />
                                )}
                                <span className="truncate">{acc.email}</span>
                                <Badge
                                  variant="outline"
                                  className="h-4 px-1 py-0 text-[9px] uppercase"
                                >
                                  {acc.provider === "s3" ? "S3" : "Drive"}
                                </Badge>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Uploads to this bucket will route exclusively to the
                    selected account.
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setNewBucketOpen(false);
                  setUseSpecificStorage(false);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creatingBucket}>
                {creatingBucket ? "Creating…" : "Create bucket"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
