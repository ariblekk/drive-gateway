"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { IconDotsVertical, IconPlus, IconPencil, IconTrash } from "@tabler/icons-react";
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
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { apiGet, apiSend, toMessage } from "./client";
import { formatBytes, formatDate } from "./format";
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle,
} from "@/components/ui/code-block";
import type { BucketItem, S3CredentialItem } from "./types";

type CreatedCredential = {
  credential: S3CredentialItem;
  secretAccessKey: string;
};

const subscribeToNothing = () => () => {};

export function S3CredentialsCard() {
  const [credentials, setCredentials] = useState<S3CredentialItem[] | null>(
    null,
  );
  const [buckets, setBuckets] = useState<BucketItem[]>([]);
  const [name, setName] = useState("");
  const [bucketId, setBucketId] = useState("");
  const [permission, setPermission] = useState<"read-write" | "read-only">(
    "read-write",
  );
  const [quotaValue, setQuotaValue] = useState("");
  const [quotaUnit, setQuotaUnit] = useState<"GB" | "MB">("GB");
  const [created, setCreated] = useState<CreatedCredential | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<S3CredentialItem | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toDelete, setToDelete] = useState<S3CredentialItem | null>(null);
  const origin = useSyncExternalStore(
    subscribeToNothing,
    () => window.location.origin,
    () => "",
  );
  const endpoint = `${origin}/s3`;
  const [region, setRegion] = useState("us-east-1");

  useEffect(() => {
    let active = true;

    apiGet<{ credentials: S3CredentialItem[] }>("/api/admin/s3-credentials")
      .then((data) => {
        if (active) {
          setCredentials(
            [...data.credentials].sort((a, b) => b.createdAt - a.createdAt),
          );
        }
      })
      .catch((cause) => {
        if (active) {
          setError(toMessage(cause));
        }
      });

    apiGet<{ buckets: BucketItem[] }>("/api/admin/buckets")
      .then((data) => {
        if (active) {
          setBuckets(data.buckets);
        }
      })
      .catch(() => undefined);

    apiGet<{ s3Region: string }>("/api/admin/config")
      .then((data) => {
        if (active && data.s3Region) {
          setRegion(data.s3Region);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  const reload = async () => {
    const data = await apiGet<{
      credentials: S3CredentialItem[];
    }>("/api/admin/s3-credentials");
    setCredentials(
      [...data.credentials].sort((a, b) => b.createdAt - a.createdAt),
    );
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!name.trim()) {
      toast.error("Give the credential a name first.");
      return;
    }

    if (!bucketId) {
      toast.error("Select the bucket this credential may access.");
      return;
    }

    const numQuota = Number(quotaValue);
    const maxStorageBytes =
      quotaValue.trim() && Number.isFinite(numQuota) && numQuota > 0
        ? Math.floor(
            numQuota * (quotaUnit === "GB" ? 1024 * 1024 * 1024 : 1024 * 1024),
          )
        : null;

    setCreating(true);
    setError(null);

    try {
      const data = await apiSend<CreatedCredential>(
        "/api/admin/s3-credentials",
        "POST",
        {
          name: name.trim(),
          bucketId,
          permission,
          maxStorageBytes,
        },
      );
      setCreated(data);
      setName("");
      setQuotaValue("");
      setCreateOpen(false);
      await reload();
      toast.success(
        "S3 credential created. Copy the secret now — it will not be shown again.",
      );
    } catch (cause) {
      toast.error(toMessage(cause));
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (credential: S3CredentialItem) => {
    setEditing(credential);
    setName(credential.name);
    setBucketId(credential.bucketId === "*" ? "" : credential.bucketId);
    setPermission(credential.permission === "read-only" ? "read-only" : "read-write");
    setQuotaValue(
      credential.maxStorageBytes
        ? String(credential.maxStorageBytes / (1024 * 1024 * 1024))
        : "",
    );
    setQuotaUnit("GB");
  };

  const updateCredential = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing || !name.trim() || !bucketId) return;

    const numQuota = Number(quotaValue);
    const maxStorageBytes =
      quotaValue.trim() && Number.isFinite(numQuota) && numQuota > 0
        ? Math.floor(numQuota * (quotaUnit === "GB" ? 1024 ** 3 : 1024 ** 2))
        : null;

    setSavingEdit(true);
    try {
      await apiSend(`/api/admin/s3-credentials/${editing.id}`, "PATCH", {
        name: name.trim(),
        bucketId,
        permission,
        maxStorageBytes,
      });
      await reload();
      setEditing(null);
      toast.success("S3 credential updated.");
    } catch (cause) {
      toast.error(toMessage(cause));
    } finally {
      setSavingEdit(false);
    }
  };

  const removeCredential = async () => {
    if (!toDelete) {
      return;
    }

    setDeleting(true);

    try {
      await apiSend(`/api/admin/s3-credentials/${toDelete.id}`, "DELETE");
      await reload();
      setToDelete(null);
      toast.success(`Deleted S3 credential "${toDelete.name}"`);
    } catch (cause) {
      toast.error(toMessage(cause));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-sm font-medium">S3 credentials</h2>
          <p className="text-xs/relaxed text-muted-foreground">
            Use these credentials for the S3-compatible endpoint at{" "}
            <code>/s3</code>. Path-style addressing is required.
          </p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <IconPlus />
          Create S3 credential
        </Button>
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 border border-border bg-muted/30 px-3 py-2 text-xs">
          <div>
            <span className="text-muted-foreground">Endpoint: </span>
            <code>{endpoint}</code>
          </div>
          <div>
            <span className="text-muted-foreground">Region: </span>
            <code>{region}</code>
          </div>
          <div className="text-muted-foreground">
            AWS Signature V4 · path-style · access key + secret
          </div>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create S3 credential</DialogTitle>
              <DialogDescription>
                Set credential scope, permissions, and optional storage limit.
              </DialogDescription>
            </DialogHeader>
            <form className="flex flex-col gap-3" onSubmit={create}>
              <div className="grid grid-cols-1 gap-2.5">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="s3-credential-name"
                    className="text-xs font-medium"
                  >
                    Credential name
                  </label>
                  <Input
                    id="s3-credential-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="My project"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium">Scope / Bucket</label>
                  <Select value={bucketId} onValueChange={setBucketId}>
                    <SelectTrigger className="h-8 w-full text-xs">
                      <SelectValue placeholder="Select a bucket" />
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
                  <label className="text-xs font-medium">Permissions</label>
                  <Select
                    value={permission}
                    onValueChange={(val) =>
                      setPermission(val as "read-write" | "read-only")
                    }
                  >
                    <SelectTrigger className="h-8 w-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="read-write">Read & Write</SelectItem>
                        <SelectItem value="read-only">Read Only</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium">Storage limit</label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={quotaValue}
                      onChange={(event) => setQuotaValue(event.target.value)}
                      placeholder="Unlimited"
                      className="h-8 flex-1 text-xs"
                    />
                    <Select
                      value={quotaUnit}
                      onValueChange={(val) => setQuotaUnit(val as "GB" | "MB")}
                    >
                      <SelectTrigger className="h-8 w-16 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="GB">GB</SelectItem>
                          <SelectItem value="MB">MB</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={creating}>
                  {creating ? "Creating…" : "Create credential"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {error && (
          <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {credentials === null ? (
          <Skeleton className="h-32 w-full" />
        ) : credentials.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No S3 credentials yet. Create one above.
          </p>
        ) : (
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Access key ID</TableHead>
                    <TableHead>Bucket</TableHead>
                    <TableHead>Permissions</TableHead>
                    <TableHead>Storage limit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last used</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {credentials.map((credential, index) => (
                    <TableRow key={credential.id}>
                      <TableCell className="text-muted-foreground">
                        {index + 1}
                      </TableCell>
                      <TableCell className="font-medium">
                        {credential.name}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs">
                          {credential.accessKeyId}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {credential.bucketId}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            credential.permission === "read-only"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {credential.permission === "read-only"
                            ? "Read only"
                            : "Read/Write"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {formatBytes(credential.usedStorageBytes ?? 0)}
                        {" / "}
                        {credential.maxStorageBytes
                          ? formatBytes(credential.maxStorageBytes)
                          : "Unlimited"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            credential.status === "active"
                              ? "secondary"
                              : "destructive"
                          }
                        >
                          {credential.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {credential.lastUsedAt
                          ? formatDate(credential.lastUsedAt)
                          : "Never"}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Actions for ${credential.name}`}
                            >
                              <IconDotsVertical />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => openEdit(credential)}>
                              <IconPencil />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => setToDelete(credential)}
                            >
                              <IconTrash />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open && !savingEdit) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit S3 credential</DialogTitle>
            <DialogDescription>
              Update name, bucket access, permissions, or storage limit.
            </DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-3" onSubmit={updateCredential}>
            <label className="flex flex-col gap-1.5 text-xs font-medium">
              Credential name
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium">
              Scope / Bucket
              <Select value={bucketId} onValueChange={setBucketId}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {buckets.map((bucket) => (
                      <SelectItem key={bucket.name} value={bucket.name}>{bucket.name}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium">
              Permissions
              <Select value={permission} onValueChange={(value) => setPermission(value as "read-write" | "read-only")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="read-write">Read & Write</SelectItem>
                    <SelectItem value="read-only">Read Only</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium">
              Storage limit
              <div className="flex gap-2">
                <Input type="number" min="1" step="1" value={quotaValue} onChange={(event) => setQuotaValue(event.target.value)} placeholder="Unlimited" />
                <Select value={quotaUnit} onValueChange={(value) => setQuotaUnit(value as "GB" | "MB")}>
                  <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="GB">GB</SelectItem>
                      <SelectItem value="MB">MB</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </label>
            <DialogFooter>
              <Button type="submit" disabled={savingEdit}>
                {savingEdit ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete S3 credential?</AlertDialogTitle>
            <AlertDialogDescription>
              “{toDelete?.name}” will be permanently removed. Requests signed
              with this access key will be rejected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void removeCredential();
              }}
            >
              {deleting ? "Deleting…" : "Delete credential"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={created !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreated(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>New S3 credential</AlertDialogTitle>
            <AlertDialogDescription>
              Copy the secret access key now — it will not be shown again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {created && (
            <>
              <CodeBlock>
                <CodeBlockHeader>
                  <CodeBlockTitle>Access key ID</CodeBlockTitle>
                  <CodeBlockActions>
                    <CodeBlockCopyButton
                      value={created.credential.accessKeyId}
                    />
                  </CodeBlockActions>
                </CodeBlockHeader>
                <CodeBlockContent>
                  {created.credential.accessKeyId}
                </CodeBlockContent>
              </CodeBlock>
              <CodeBlock>
                <CodeBlockHeader>
                  <CodeBlockTitle>Secret access key</CodeBlockTitle>
                  <CodeBlockActions>
                    <CodeBlockCopyButton value={created.secretAccessKey} />
                  </CodeBlockActions>
                </CodeBlockHeader>
                <CodeBlockContent>{created.secretAccessKey}</CodeBlockContent>
              </CodeBlock>
            </>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
