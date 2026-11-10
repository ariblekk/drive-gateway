"use client";

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

import type { FileItem } from "../types";

export function FileDeleteAlert({
  file,
  busy,
  onClose,
  onConfirm,
}: {
  file: FileItem | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <AlertDialog open={file !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete permanently?</AlertDialogTitle>
          <AlertDialogDescription>
            {`"${file?.name}" will be permanently deleted from storage. This action cannot be undone.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              void onConfirm();
            }}
          >
            {busy ? "Deleting..." : "Delete permanently"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function BulkDeleteAlert({
  open,
  count,
  busy,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  count: number;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onOpenChange(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {count} item(s) permanently?
          </AlertDialogTitle>
          <AlertDialogDescription>
            All selected files and folders will be permanently deleted from
            storage. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              void onConfirm();
            }}
          >
            {busy ? "Deleting..." : "Delete permanently"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}