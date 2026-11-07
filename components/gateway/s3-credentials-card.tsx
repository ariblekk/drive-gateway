"use client";

import { useEffect, useState } from "react";
import { IconCopy, IconPlus, IconTrash } from "@tabler/icons-react";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import type { BucketItem, S3CredentialItem } from "./types";

type CreatedCredential = {
  credential: S3CredentialItem;
  secretAccessKey: string;
};

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
  const [revoking, setRevoking] = useState(false);
  const [toRevoke, setToRevoke] = useState<S3CredentialItem | null>(null);
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
          allowAllBuckets: bucketId === "*",
          permission,
          maxStorageBytes,
        },
      );
      setCreated(data);
      setName("");
      setQuotaValue("");
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

  const copySecret = async () => {
    if (!created) {
      return;
    }

    try {
      await navigator.clipboard.writeText(created.secretAccessKey);
      toast.success("Secret access key copied.");
    } catch {
      toast.error("Could not copy. Select the secret and copy manually.");
    }
  };

  const revoke = async () => {
    if (!toRevoke) {
      return;
    }

    setRevoking(true);

    try {
      await apiSend(`/api/admin/s3-credentials/${toRevoke.id}`, "DELETE");
      await reload();
      setToRevoke(null);
      toast.success(`Revoked S3 credential "${toRevoke.name}"`);
    } catch (cause) {
      toast.error(toMessage(cause));
    } finally {
      setRevoking(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>S3 credentials</CardTitle>
        <CardDescription>
          Use these credentials for the S3-compatible endpoint at{" "}
          <code>/s3</code>. Path-style addressing is required.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 border border-border bg-muted/30 px-3 py-2 text-xs">
          <div>
            <span className="text-muted-foreground">Endpoint: </span>
            <code>http://&lt;host&gt;/s3</code>
          </div>
          <div>
            <span className="text-muted-foreground">Region: </span>
            <code>{region}</code>
          </div>
          <div className="text-muted-foreground">
            AWS Signature V4 · path-style · access key + secret
          </div>
        </div>

        <form className="flex flex-col gap-3" onSubmit={create}>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
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
                    <SelectItem value="*">All buckets (*)</SelectItem>
                    {buckets.map((b) => (
                      <SelectItem key={b.name} value={b.name}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {bucketId === "*" && (
                <p className="text-[11px] text-muted-foreground">
                  Grants this key access to every bucket in the gateway.
                </p>
              )}
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
                <Button type="submit" disabled={creating}>
                  <IconPlus />
                  {creating ? "Creating…" : "Create S3 credential"}
                </Button>
              </div>
            </div>
          </div>
        </form>

        {created && (
          <div className="flex flex-col gap-2 border border-primary/40 bg-primary/5 p-3">
            <p className="text-xs font-medium">
              New S3 credential (secret shown once):
            </p>
            <div className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Access key ID</span>
              <code className="overflow-x-auto bg-background px-2 py-1">
                {created.credential.accessKeyId}
              </code>
            </div>
            <div className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Secret access key</span>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto bg-background px-2 py-1">
                  {created.secretAccessKey}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void copySecret()}
                >
                  <IconCopy />
                  Copy
                </Button>
              </div>
            </div>
          </div>
        )}

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
          <Table>
            <TableHeader>
              <TableRow>
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
              {credentials.map((credential) => (
                <TableRow key={credential.id}>
                  <TableCell className="font-medium">
                    {credential.name}
                  </TableCell>
                  <TableCell>
                    <code className="text-xs">{credential.accessKeyId}</code>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {credential.bucketId === "*"
                        ? "All (*)"
                        : credential.bucketId}
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
                    {credential.status === "active" && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setToRevoke(credential)}
                      >
                        <IconTrash />
                        Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <AlertDialog
        open={toRevoke !== null}
        onOpenChange={(open) => {
          if (!open && !revoking) {
            setToRevoke(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke S3 credential?</AlertDialogTitle>
            <AlertDialogDescription>
              “{toRevoke?.name}” will stop working immediately. Requests signed
              with this access key will be rejected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={revoking}
              onClick={(event) => {
                event.preventDefault();
                void revoke();
              }}
            >
              {revoking ? "Revoking…" : "Revoke credential"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
