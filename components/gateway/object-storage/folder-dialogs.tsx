"use client";

import { useState } from "react";

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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { FolderItem } from "../types";

export type FolderFormState =
  | { type: "create" }
  | { type: "rename"; folder: FolderItem }
  | { type: "move"; folder: FolderItem };

function FolderFormBody({
  form,
  onClose,
  allFolders,
  onSubmit,
}: {
  form: FolderFormState;
  onClose: () => void;
  allFolders: FolderItem[];
  onSubmit: (
    form: FolderFormState,
    name: string,
    parent: string,
  ) => Promise<void>;
}) {
  const [name, setName] = useState(
    form.type === "rename" ? form.folder.name : "",
  );
  const [parent, setParent] = useState(
    form.type === "move" ? (form.folder.parentId ?? "root") : "root",
  );

  const editingId = "folder" in form ? form.folder.id : null;

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {form.type === "create"
            ? "New folder"
            : form.type === "rename"
              ? "Rename folder"
              : "Move folder"}
        </DialogTitle>
        <DialogDescription>
          {form.type === "create"
            ? "Create a folder inside the current folder."
            : form.type === "rename"
              ? "Enter a new folder name."
              : "Choose a destination folder."}
        </DialogDescription>
      </DialogHeader>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit(form, name, parent);
        }}
      >
        {form.type === "move" ? (
          <Select value={parent} onValueChange={setParent}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Destination" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="root">/ (Root)</SelectItem>
                {allFolders
                  .filter((folder) => folder.id !== editingId)
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
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Folder name"
            autoFocus
          />
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit">
            {form.type === "create"
              ? "Create"
              : form.type === "rename"
                ? "Rename"
                : "Move"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function FolderFormDialog({
  form,
  onClose,
  allFolders,
  onSubmit,
}: {
  form: FolderFormState | null;
  onClose: () => void;
  allFolders: FolderItem[];
  onSubmit: (
    form: FolderFormState,
    name: string,
    parent: string,
  ) => Promise<void>;
}) {
  return (
    <Dialog open={form !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {form && (
          <FolderFormBody
            key={form.type + ("folder" in form ? form.folder.id : "")}
            form={form}
            onClose={onClose}
            allFolders={allFolders}
            onSubmit={onSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function MoveFilesBody({
  count,
  allFolders,
  excludedFolderIds,
  onCancel,
  onConfirm,
}: {
  count: number;
  allFolders: FolderItem[];
  excludedFolderIds: Set<string>;
  onCancel: () => void;
  onConfirm: (destination: string) => Promise<void>;
}) {
  const [destination, setDestination] = useState("root");
  const [busy, setBusy] = useState(false);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Move {count} item(s)</DialogTitle>
        <DialogDescription>Choose a destination folder.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <Select value={destination} onValueChange={setDestination}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Destination" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="root">/ (Root)</SelectItem>
              {allFolders
                .filter((folder) => !excludedFolderIds.has(folder.id))
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
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(destination);
              } finally {
                setBusy(false);
              }
            }}
          >
            Move
          </Button>
        </DialogFooter>
      </div>
    </>
  );
}

export function MoveFilesDialog({
  open,
  onOpenChange,
  count,
  allFolders,
  excludedFolderIds,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  allFolders: FolderItem[];
  excludedFolderIds: Set<string>;
  onConfirm: (destination: string) => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <MoveFilesBody
            count={count}
            allFolders={allFolders}
            excludedFolderIds={excludedFolderIds}
            onCancel={() => onOpenChange(false)}
            onConfirm={onConfirm}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function FolderDeleteAlert({
  folder,
  busy,
  onClose,
  onConfirm,
}: {
  folder: FolderItem | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <AlertDialog
      open={folder !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete folder permanently?</AlertDialogTitle>
          <AlertDialogDescription>
            {`"${folder?.name}" and its contents will be permanently deleted from storage. This cannot be undone.`}
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
            {busy ? "Deleting…" : "Delete permanently"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
