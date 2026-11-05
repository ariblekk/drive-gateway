"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IconApi, IconCopy, IconPlus, IconTrash } from "@tabler/icons-react";
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
import { formatDate } from "./format";
import { S3CredentialsCard } from "./s3-credentials-card";
import type { ApiKeyItem } from "./types";

export function ApiKeysView() {
  const [keys, setKeys] = useState<ApiKeyItem[] | null>(null);
  const [name, setName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [keyToRevoke, setKeyToRevoke] = useState<ApiKeyItem | null>(null);
  const [revoking, setRevoking] = useState(false);

  const fetchKeys = useCallback(
    () => apiGet<{ apiKeys: ApiKeyItem[] }>("/api/admin/api-keys"),
    [],
  );

  const load = useCallback(async () => {
    const data = await fetchKeys();
    setKeys([...data.apiKeys].sort((a, b) => b.createdAt - a.createdAt));
  }, [fetchKeys]);

  useEffect(() => {
    let active = true;

    fetchKeys()
      .then((data) => {
        if (active) {
          setKeys(
            [...data.apiKeys].sort((a, b) => b.createdAt - a.createdAt),
          );
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
  }, [fetchKeys]);

  const createKey = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!name.trim()) {
      toast.error("Give the key a name first.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const data = await apiSend<{ apiKey: ApiKeyItem; key: string }>(
        "/api/admin/api-keys",
        "POST",
        { name: name.trim() },
      );
      setCreatedKey(data.key);
      setName("");
      await load();
      toast.success(
        "API key created. Copy it now — it will not be shown again.",
      );
    } catch (cause) {
      toast.error(toMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const copyKey = async () => {
    if (!createdKey) {
      return;
    }

    try {
      await navigator.clipboard.writeText(createdKey);
      toast.success("API key copied to clipboard.");
    } catch {
      toast.error("Could not copy to clipboard. Select and copy manually.");
    }
  };

  const revoke = async (key: ApiKeyItem) => {
    setError(null);
    setRevoking(true);

    try {
      await apiSend(`/api/admin/api-keys/${key.id}`, "DELETE");
      await load();
      setKeyToRevoke(null);
      toast.success(`Revoked API key "${key.name}"`);
    } catch (cause) {
      toast.error(toMessage(cause));
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle>Create API key</CardTitle>
            <CardDescription>
              Use these keys with the public <code>/api/v1</code> endpoints.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/docs" target="_blank">
              <IconApi />
              <span>Swagger Docs</span>
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-2 md:flex-row md:items-end"
            onSubmit={createKey}
          >
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="api-key-name" className="text-xs font-medium">
                Key name
              </label>
              <Input
                id="api-key-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="My automation"
              />
            </div>
            <Button type="submit" disabled={busy}>
              <IconPlus />
              {busy ? "Creating…" : "Create key"}
            </Button>
          </form>

          {createdKey && (
            <div className="mt-3 flex flex-col gap-2 border border-primary/40 bg-primary/5 p-3">
              <p className="text-xs font-medium">
                Your new API key (shown once):
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto bg-background px-2 py-1 text-xs">
                  {createdKey}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void copyKey()}
                >
                  <IconCopy />
                  Copy
                </Button>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </CardContent>
        <CardContent>
          {keys === null ? (
            <Skeleton className="h-32 w-full" />
          ) : keys.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No API keys yet. Create one above.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell>
                      <code className="text-xs">{key.keyPrefix}…</code>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={key.revokedAt ? "destructive" : "secondary"}
                      >
                        {key.revokedAt ? "revoked" : "active"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(key.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {key.lastUsedAt ? formatDate(key.lastUsedAt) : "Never"}
                    </TableCell>
                    <TableCell className="text-right">
                      {!key.revokedAt && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setKeyToRevoke(key)}
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
      </Card>

      <S3CredentialsCard />

      <AlertDialog
        open={keyToRevoke !== null}
        onOpenChange={(open) => {
          if (!open && !revoking) {
            setKeyToRevoke(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API key?</AlertDialogTitle>
            <AlertDialogDescription>
              “{keyToRevoke?.name}” will stop working immediately. Requests
              using this key will be rejected with 401. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={revoking}
              onClick={(event) => {
                event.preventDefault();

                if (keyToRevoke) {
                  void revoke(keyToRevoke);
                }
              }}
            >
              {revoking ? "Revoking…" : "Revoke key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
