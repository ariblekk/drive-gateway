"use client";

import { useEffect, useState } from "react";
import { IconBrandGoogle, IconDatabase } from "@tabler/icons-react";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
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

import { apiGet, apiSend, toMessage } from "../client";
import type { Account } from "../types";

export function CreateBucketDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [useSpecific, setUseSpecific] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    apiGet<{ accounts: Account[] }>("/api/admin/accounts")
      .then((res) => {
        const active = res.accounts.filter((a) => a.status === "active");
        setAccounts(active);
        setAccountId(active[0]?.id ?? "");
      })
      .catch(() => undefined);
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = name.trim().toLowerCase();
    if (!value) {
      toast.error("Bucket name is required.");
      return;
    }

    setCreating(true);
    try {
      await apiSend("/api/admin/buckets", "POST", {
        name: value,
        storageAccountId: useSpecific && accountId ? accountId : null,
      });
      toast.success(`Bucket "${value}" created.`);
      setName("");
      setUseSpecific(false);
      onOpenChange(false);
      onCreated(value);
    } catch (cause) {
      toast.error(toMessage(cause));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setUseSpecific(false);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create bucket</DialogTitle>
          <DialogDescription>
            Enter an S3 bucket name (3–63 characters, lowercase letters,
            numbers, and hyphens).
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-bucket-name" className="text-xs font-medium">
              Bucket name
            </label>
            <Input
              id="new-bucket-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="my-new-bucket"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2.5 border border-border p-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
              <Checkbox
                checked={useSpecific}
                onCheckedChange={(checked) => setUseSpecific(Boolean(checked))}
              />
              <span>Use specific storage account</span>
            </label>
            {useSpecific && (
              <div className="flex flex-col gap-1.5 pt-1">
                {accounts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No active storage accounts available.
                  </p>
                ) : (
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger className="w-full text-xs">
                      <SelectValue placeholder="Select storage account" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            <div className="flex items-center gap-2">
                              {account.provider === "s3" ? (
                                <IconDatabase className="size-3.5 text-blue-500" />
                              ) : (
                                <IconBrandGoogle className="size-3.5 text-amber-500" />
                              )}
                              <span className="truncate">{account.email}</span>
                              <Badge
                                variant="outline"
                                className="h-4 px-1 py-0 text-[9px] uppercase"
                              >
                                {account.provider === "s3" ? "S3" : "Drive"}
                              </Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Uploads to this bucket will route exclusively to the selected
                  account.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={creating}>
              {creating ? "Creating..." : "Create bucket"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteBucketDialog({
  open,
  onOpenChange,
  bucketName,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bucketName: string;
  onConfirm: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete bucket “{bucketName}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Bucket yang masih berisi file/folder atau terhubung ke kredensial S3
            aktif tidak dapat dihapus. Kosongkan bucket dan nonaktifkan
            kredensialnya terlebih dahulu.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleting}
            onClick={async (event) => {
              event.preventDefault();
              setDeleting(true);
              try {
                await onConfirm();
              } finally {
                setDeleting(false);
              }
            }}
          >
            {deleting ? "Deleting..." : "Delete bucket"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}