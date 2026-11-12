"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  IconArrowsMove,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconDotsVertical,
  IconDownload,
  IconEye,
  IconFolder,
  IconFolderPlus,
  IconInfoCircle,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { toast } from "sonner";

import {
  columnVisibilityFeature,
  createColumnHelper,
  FlexRender,
  tableFeatures,
  useTable,
  type ColumnVisibilityState,
} from "@tanstack/react-table";

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
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

import { isInlineSafe, resolveContentType } from "@/lib/preview";

import { BulkBar } from "../bulk-bar";
import {
  apiGet,
  apiSend,
  FILES_CHANGED_EVENT,
  notifyStorageChanged,
  toMessage,
} from "../client";
import { formatBytes, formatDate } from "../format";
import { useHeader } from "../header-provider";
import { useUploadDialog } from "../upload-provider";
import type {
  Account,
  Breadcrumb as BreadcrumbData,
  BucketItem,
  FileItem,
  FolderItem,
} from "../types";

import { CreateBucketDialog, DeleteBucketDialog } from "./bucket-dialogs";
import { BucketMetricsTab } from "./bucket-metrics-tab";
import { BucketSettingsTab } from "./bucket-settings-tab";
import { BulkDeleteAlert, FileDeleteAlert } from "./delete-dialogs";
import { FileDetailSheet } from "./file-detail-sheet";
import {
  FolderDeleteAlert,
  FolderFormDialog,
  MoveFilesDialog,
  type FolderFormState,
} from "./folder-dialogs";

const PAGE_SIZE = 20;

function canPreview(file: FileItem): boolean {
  return isInlineSafe(resolveContentType(null, file.mimeType, file.name));
}

interface FilesTableRow {
  id: string;
  name: string;
  size: string;
  account: string;
  path: string;
  status: string;
  createdAt: string;
  folder?: FolderItem;
  file?: FileItem;
}

const filesTableFeatures = tableFeatures({ columnVisibilityFeature });

const filesColumnHelper = createColumnHelper<
  typeof filesTableFeatures,
  FilesTableRow
>();

export function ObjectStorageView() {
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
  const [detailFile, setDetailFile] = useState<FileItem | null>(null);
  const [folderForm, setFolderForm] = useState<FolderFormState | null>(null);
  const [folderAction, setFolderAction] = useState<FolderItem | null>(null);
  const [moveFilesOpen, setMoveFilesOpen] = useState(false);
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
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [deleteBucketOpen, setDeleteBucketOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [columnVisibility, setColumnVisibility] =
    useState<ColumnVisibilityState>({});
  const { openUploadDialog } = useUploadDialog();
  const { setActions, setTitleContent } = useHeader();

  const fetchBuckets = useCallback(async () => {
    return apiGet<{ buckets: BucketItem[] }>("/api/admin/buckets");
  }, []);

  const fetchFolders = useCallback(async () => {
    const bucketParam = `&bucketId=${encodeURIComponent(selectedBucket)}`;
    return apiGet<{
      folders: FolderItem[];
      breadcrumbs: BreadcrumbData[];
    }>(
      `/api/admin/folders?parentId=${encodeURIComponent(
        currentFolderId ?? "root",
      )}${bucketParam}`,
    );
  }, [currentFolderId, selectedBucket]);

  const fetchFiles = useCallback(
    (query: string) => {
      const params = new URLSearchParams();
      params.set("limit", String(pageSize));
      params.set("offset", String(offset));
      params.set("bucketId", selectedBucket);
      params.set("folderId", currentFolderId ?? "root");

      if (query) {
        params.set("q", query);
      }

      return apiGet<{ files: FileItem[]; total: number }>(
        `/api/admin/files?${params.toString()}`,
      );
    },
    [currentFolderId, offset, pageSize, selectedBucket],
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

  const switchBucket = useCallback((name: string) => {
    localStorage.setItem("drive:selected-bucket", name);
    window.dispatchEvent(new Event("drive:bucket-change"));
    setCurrentFolderId(null);
    setSelectedIds(new Set());
    setSelectedFolderIds(new Set());
    setQ("");
    setAppliedQ("");
    setOffset(0);
  }, []);

  const handleDeleteBucket = async () => {
    const name = selectedBucket;

    if (name === "default") return;

    try {
      await apiSend(`/api/admin/buckets/${encodeURIComponent(name)}`, "DELETE");
      toast.success(`Bucket "${name}" deleted.`);
      setDeleteBucketOpen(false);
      setBuckets((current) => current.filter((bucket) => bucket.name !== name));
      switchBucket("default");
      setCurrentFolderId(null);
    } catch (cause) {
      toast.error(toMessage(cause));
    }
  };

  const handleBucketCreated = async (name: string) => {
    try {
      const bData = await fetchBuckets();
      setBuckets(bData.buckets);
      switchBucket(name);
    } catch (cause) {
      toast.error(toMessage(cause));
    }
  };

  useEffect(() => {
    apiGet<{ accounts: Account[] }>("/api/admin/accounts")
      .then((res) =>
        setAccounts(res.accounts.filter((account) => account.status === "active")),
      )
      .catch(() => undefined);
  }, []);

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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(
    Math.max(1, Math.floor(offset / pageSize) + 1),
    totalPages,
  );

  const deleteSelected = async () => {
    if (!fileToDelete) {
      return;
    }

    const name = fileToDelete.name;
    const endpoint = `/api/admin/files/${fileToDelete.id}`;

    setBusyId(fileToDelete.id);
    setError(null);

    try {
      await apiSend(endpoint, "DELETE");
      await load();
      notifyStorageChanged();
      toast.success(`Deleted ${name}`);
      setFileToDelete(null);
    } catch (cause) {
      toast.error(toMessage(cause));
    } finally {
      setBusyId(null);
    }
  };

  const runBulk = async () => {
    const fileIds = Array.from(selectedIds);
    const folderIds = Array.from(selectedFolderIds);
    const count = fileIds.length + folderIds.length;

    if (count === 0) {
      return;
    }

    const toastId = toast.loading(`Deleting ${count} item(s)…`);

    setBusyId("bulk");

    try {
      const fileRequests = fileIds.map((id) =>
        apiSend(`/api/admin/files/${id}`, "DELETE"),
      );

      const folderRequests = folderIds.map((id) =>
        apiSend(`/api/admin/folders/${id}`, "DELETE"),
      );

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
        toast.success(`${succeeded} item(s) deleted`, { id: toastId });
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
    setMoveFilesOpen(true);

    try {
      await fetchAllFolders();
    } catch (cause) {
      toast.error(toMessage(cause));
    }
  };

  const submitMoveFiles = async (destination: string) => {
    const fileIds = Array.from(selectedIds);
    const folderIds = Array.from(selectedFolderIds);

    if (fileIds.length === 0 && folderIds.length === 0) {
      return;
    }

    setBusyId("bulk");

    try {
      const target = destination === "root" ? null : destination;
      let moved = 0;
      let failed = 0;

      if (fileIds.length > 0) {
        try {
          const data = await apiSend<{ moved: number }>(
            "/api/admin/files/move",
            "POST",
            { ids: fileIds, folderId: target },
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
              parentId: target,
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
    setActions(
      <Button
        variant="outline"
        aria-label="New bucket"
        title="New bucket"
        onClick={() => setNewBucketOpen(true)}
      >
        <IconPlus />
        <span className="hidden sm:inline">New bucket</span>
      </Button>,
    );

    return () => {
      setActions(null);
    };
  }, [setActions]);

  useEffect(() => {
    setTitleContent(
      <Select value={selectedBucket} onValueChange={switchBucket}>
        <SelectTrigger className="h-8 w-[180px]" aria-label="Bucket">
          <SelectValue placeholder="Bucket" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {buckets.map((bucket) => (
              <SelectItem key={bucket.name} value={bucket.name}>
                {bucket.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>,
    );

    return () => {
      setTitleContent(null);
    };
  }, [buckets, selectedBucket, switchBucket, setTitleContent]);

  const submitFolderForm = async (
    form: FolderFormState,
    name: string,
    parent: string,
  ) => {
    try {
      if (form.type === "create") {
        if (!name.trim()) {
          toast.error("Folder name is required.");
          return;
        }

        await apiSend("/api/admin/folders", "POST", {
          name: name.trim(),
          parentId: currentFolderId,
          bucketId: selectedBucket,
        });
        toast.success("Folder created");
      } else if (form.type === "rename") {
        if (!name.trim()) {
          toast.error("Folder name is required.");
          return;
        }

        await apiSend(`/api/admin/folders/${form.folder.id}`, "PATCH", {
          name: name.trim(),
        });
        toast.success("Folder renamed");
      } else {
        await apiSend(`/api/admin/folders/${form.folder.id}`, "PATCH", {
          parentId: parent === "root" ? null : parent,
        });
        toast.success("Folder moved");
      }

      if (form.type === "move") {
        setSelectedFolderIds((current) => {
          const next = new Set(current);
          next.delete(form.folder.id);
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

    const folder = folderAction;
    setBusyId(folder.id);

    try {
      await apiSend(`/api/admin/folders/${folder.id}`, "DELETE");
      toast.success(`Deleted ${folder.name} permanently`);

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

  const isLoading = folders === null || files === null;
  const hasItems = visibleFolders.length > 0 || (files && files.length > 0);

  const tableRows: FilesTableRow[] = [
    ...visibleFolders.map((folder) => ({
      id: `folder-${folder.id}`,
      name: folder.name,
      size: "—",
      account: "—",
      path: folder.path,
      status: folder.status,
      createdAt: formatDate(folder.createdAt),
      folder,
    })),
    ...(files ?? []).map((file) => ({
      id: file.id,
      name: file.name,
      size: formatBytes(file.size),
      account: file.accountEmail ?? "—",
      path: file.path,
      status: file.status,
      createdAt: formatDate(file.createdAt),
      file,
    })),
  ];

  const columns = filesColumnHelper.columns([
    filesColumnHelper.display({
      id: "select",
      header: () => (
        <Checkbox
          checked={allSelected ? true : someSelected ? "indeterminate" : false}
          onCheckedChange={(value) => toggleAll(Boolean(value))}
          aria-label="Select all files"
        />
      ),
      cell: ({ row }) => {
        const { folder, file } = row.original;

        if (folder) {
          return (
            <Checkbox
              checked={selectedFolderIds.has(folder.id)}
              onCheckedChange={(value) =>
                toggleFolderSelected(folder.id, Boolean(value))
              }
              aria-label={`Select ${folder.name}`}
            />
          );
        }

        if (!file) return null;

        return (
          <Checkbox
            checked={selectedIds.has(file.id)}
            onCheckedChange={(value) => toggleSelected(file.id, Boolean(value))}
            aria-label={`Select ${file.name}`}
          />
        );
      },
      enableHiding: false,
    }),
    filesColumnHelper.accessor("name", {
      header: "Name",
      cell: ({ row }) => {
        const { folder, name } = row.original;

        if (folder) {
          return (
            <button
              type="button"
              className="flex min-w-0 items-center gap-2 text-left hover:underline"
              onClick={() => navigateTo(folder.id)}
            >
              <IconFolder className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">{name}</span>
            </button>
          );
        }

        return (
          <span className="block max-w-64 truncate font-medium">{name}</span>
        );
      },
      enableHiding: false,
    }),
    filesColumnHelper.accessor("size", { header: "Size" }),
    filesColumnHelper.accessor("account", {
      header: "Account",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.account}
        </span>
      ),
    }),
    filesColumnHelper.accessor("path", {
      id: "folder",
      header: "Folder",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.path}
        </span>
      ),
    }),
    filesColumnHelper.accessor("status", {
      header: "Status",
      cell: ({ row }) => (
        <Badge
          variant={
            row.original.status === "active"
              ? "secondary"
              : row.original.folder
                ? "destructive"
                : "outline"
          }
        >
          {row.original.status}
        </Badge>
      ),
    }),
    filesColumnHelper.accessor("createdAt", {
      id: "created",
      header: "Created",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.createdAt}
        </span>
      ),
    }),
    filesColumnHelper.display({
      id: "actions",
      header: () => <div className="w-full text-right">Actions</div>,
      cell: ({ row }) => {
        const { folder, file } = row.original;

        if (folder) {
          return (
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
                  <DropdownMenuItem
                    onSelect={() =>
                      void openFolderForm({ type: "rename", folder })
                    }
                    disabled={busyId === folder.id}
                  >
                    <IconPencil />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      void openFolderForm({ type: "move", folder })
                    }
                    disabled={busyId === folder.id}
                  >
                    <IconArrowsMove />
                    Move
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setFolderAction(folder)}
                    disabled={busyId === folder.id}
                  >
                    <IconTrash />
                    Delete permanently
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        }

        if (!file) return null;

        return (
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
                <DropdownMenuItem
                  onSelect={() => setDetailFile(file)}
                  disabled={busyId === file.id}
                >
                  <IconInfoCircle />
                  Details
                </DropdownMenuItem>
                {canPreview(file) && (
                  <DropdownMenuItem asChild>
                    <a
                      href={`/api/admin/files/${file.id}/preview`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <IconEye />
                      Preview
                    </a>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <a
                    href={`/api/admin/files/${file.id}/download`}
                    onClick={() => toast.info(`Downloading ${file.name}`)}
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
                  onSelect={() => setFileToDelete(file)}
                  disabled={busyId === file.id}
                >
                  <IconTrash />
                  Delete permanently
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
      enableHiding: false,
    }),
  ]);

  const table = useTable({
    features: filesTableFeatures,
    data: tableRows,
    columns,
    state: { columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
  });

  const activeBucket = buckets.find((bucket) => bucket.name === selectedBucket);

  return (
    <div
      className={`flex flex-col gap-4${
        selectedCount > 0 ? " pb-24 sm:pb-16" : ""
      }`}
    >
      <Tabs defaultValue="objects" className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="objects">Objects</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="objects" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
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
        </ButtonGroup>
      </div>

      <div className="flex flex-col gap-3">
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
          <Button variant="outline" onClick={applySearch}>
            <IconSearch />
            Search
          </Button>
        </div>

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !hasItems ? (
          <Card className="p-0">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {appliedQ ? <IconSearch /> : <IconFolder />}
                </EmptyMedia>
                <EmptyTitle>
                  {appliedQ ? "No matching objects" : "This location is empty"}
                </EmptyTitle>
                <EmptyDescription>
                  {appliedQ
                    ? `Nothing matches “${appliedQ}”.`
                    : "Upload a file or create a folder to get started."}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                {appliedQ ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setQ("");
                      setAppliedQ("");
                    }}
                  >
                    Clear search
                  </Button>
                ) : (
                  <Button
                    onClick={() =>
                      openUploadDialog(currentFolderId, selectedBucket)
                    }
                  >
                    <IconUpload />
                    Upload
                  </Button>
                )}
              </EmptyContent>
            </Empty>
          </Card>
        ) : (
          <Card className="p-0">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} colSpan={header.colSpan}>
                        {header.isPlaceholder ? null : (
                          <FlexRender header={header} />
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          <FlexRender cell={cell} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center"
                    >
                      No results.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        )}

        {files !== null && total > 0 && (
          <div className="flex items-center justify-between border-t border-border pt-3">
            <div className="hidden flex-1 text-sm text-muted-foreground lg:flex">
              {`${Math.min(offset + 1, total)}–${Math.min(
                offset + pageSize,
                total,
              )} of ${total}`}
            </div>
            <div className="flex w-full items-center gap-8 lg:w-fit">
              <div className="hidden items-center gap-2 lg:flex">
                <Label htmlFor="rows-per-page" className="text-sm font-medium">
                  Rows per page
                </Label>
                <Select
                  value={`${pageSize}`}
                  onValueChange={(value) => {
                    setPageSize(Number(value));
                    setOffset(0);
                  }}
                >
                  <SelectTrigger size="sm" className="w-20" id="rows-per-page">
                    <SelectValue placeholder={pageSize} />
                  </SelectTrigger>
                  <SelectContent side="top">
                    {[10, 20, 30, 40, 50].map((size) => (
                      <SelectItem key={size} value={`${size}`}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex w-fit items-center justify-center text-sm font-medium">
                Page {currentPage} of {totalPages}
              </div>
              <div className="ml-auto flex items-center gap-2 lg:ml-0">
                <Button
                  variant="outline"
                  className="hidden size-8 lg:flex"
                  size="icon"
                  onClick={() => goToOffset(0)}
                  disabled={currentPage === 1}
                >
                  <span className="sr-only">Go to first page</span>
                  <IconChevronsLeft />
                </Button>
                <Button
                  variant="outline"
                  className="size-8"
                  size="icon"
                  onClick={() => goToOffset(offset - pageSize)}
                  disabled={currentPage === 1}
                >
                  <span className="sr-only">Go to previous page</span>
                  <IconChevronLeft />
                </Button>
                <Button
                  variant="outline"
                  className="size-8"
                  size="icon"
                  onClick={() => goToOffset(offset + pageSize)}
                  disabled={currentPage === totalPages}
                >
                  <span className="sr-only">Go to next page</span>
                  <IconChevronRight />
                </Button>
                <Button
                  variant="outline"
                  className="hidden size-8 lg:flex"
                  size="icon"
                  onClick={() => goToOffset((totalPages - 1) * pageSize)}
                  disabled={currentPage === totalPages}
                >
                  <span className="sr-only">Go to last page</span>
                  <IconChevronsRight />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
        </TabsContent>

        <TabsContent value="metrics" className="flex flex-col gap-4">
          <BucketMetricsTab buckets={buckets} selectedBucket={selectedBucket} />
        </TabsContent>

        <TabsContent value="settings" className="flex flex-col gap-4">
          <BucketSettingsTab
            bucket={activeBucket}
            accounts={accounts}
            onDelete={() => setDeleteBucketOpen(true)}
          />
        </TabsContent>
      </Tabs>

      <FolderFormDialog
        form={folderForm}
        onClose={() => setFolderForm(null)}
        allFolders={allFolders}
        onSubmit={submitFolderForm}
      />

      <MoveFilesDialog
        open={moveFilesOpen}
        onOpenChange={setMoveFilesOpen}
        count={selectedCount}
        allFolders={allFolders}
        excludedFolderIds={selectedFolderIds}
        onConfirm={submitMoveFiles}
      />

      <FolderDeleteAlert
        folder={folderAction}
        busy={busyId === folderAction?.id}
        onClose={() => setFolderAction(null)}
        onConfirm={runFolderAction}
      />

      <FileDeleteAlert
        file={fileToDelete}
        busy={deleting}
        onClose={() => setFileToDelete(null)}
        onConfirm={deleteSelected}
      />
      <BulkBar
        selectedCount={selectedCount}
        busy={busyId === "bulk"}
        onClear={clearSelection}
      >
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
          onClick={() => setBulkDeleteOpen(true)}
          disabled={busyId === "bulk"}
          aria-label="Delete permanently"
          title="Delete permanently"
        >
          <IconTrash />
          <span className="hidden sm:inline">Delete permanently</span>
        </Button>
      </BulkBar>

      <BulkDeleteAlert
        open={bulkDeleteOpen}
        count={selectedCount}
        busy={busyId === "bulk"}
        onOpenChange={setBulkDeleteOpen}
        onConfirm={async () => {
          await runBulk();
          setBulkDeleteOpen(false);
        }}
      />

      <DeleteBucketDialog
        open={deleteBucketOpen}
        onOpenChange={setDeleteBucketOpen}
        bucketName={selectedBucket}
        onConfirm={handleDeleteBucket}
      />
      <CreateBucketDialog
        open={newBucketOpen}
        onOpenChange={setNewBucketOpen}
        onCreated={handleBucketCreated}
      />

      <FileDetailSheet
        file={detailFile}
        onClose={() => setDetailFile(null)}
        onDelete={(file) => {
          setDetailFile(null);
          setFileToDelete(file);
        }}
      />
    </div>
  );
}
