"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  IconDotsVertical,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  apiGet,
  apiSend,
  notifyStorageChanged,
  toMessage,
} from "./client";
import {
  formatBytes,
  formatDate,
  formatRelativeTime,
  quotaPercent,
} from "./format";
import { useHeader } from "./header-provider";
import type { Account } from "./types";

function statusVariant(status: string) {
  if (status === "active") {
    return "secondary" as const;
  }

  if (status === "error") {
    return "destructive" as const;
  }

  return "outline" as const;
}

export function AccountsView() {
  const searchParams = useSearchParams();
  const connected = searchParams?.get("connected") ?? null;
  const oauthError = searchParams?.get("error") ?? null;
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { setActions } = useHeader();

  const fetchAccounts = useCallback(
    () => apiGet<{ accounts: Account[] }>("/api/admin/accounts"),
    [],
  );

  const load = useCallback(async () => {
    const data = await fetchAccounts();
    setAccounts(data.accounts);
  }, [fetchAccounts]);

  useEffect(() => {
    let active = true;

    fetchAccounts()
      .then((data) => {
        if (active) {
          setAccounts(data.accounts);
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
  }, [fetchAccounts]);

  const refreshAccount = async (account: Account) => {
    setBusy(account.id);
    setError(null);

    try {
      await apiGet(`/api/admin/accounts/${account.id}/refresh`);
      await load();
      notifyStorageChanged();
      toast.success(`Quota refreshed for ${account.email}`);
    } catch (cause) {
      toast.error(toMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const toggleStatus = async (account: Account) => {
    setBusy(account.id);
    setError(null);

    const resuming = account.status === "paused";

    try {
      await apiSend(`/api/admin/accounts/${account.id}`, "PATCH", {
        status: resuming ? "active" : "paused",
      });
      await load();
      notifyStorageChanged();
      toast.success(resuming ? "Account resumed" : "Account paused");
    } catch (cause) {
      toast.error(toMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const disconnectAccount = async (account: Account) => {
    if (
      !window.confirm(
        `Disconnect ${account.email}? Stored files stay in Google Drive, but this account will no longer be used.`,
      )
    ) {
      return;
    }

    setBusy(account.id);
    setError(null);

    try {
      await apiSend(`/api/admin/accounts/${account.id}`, "DELETE");
      await load();
      notifyStorageChanged();
      toast.success(`Disconnected ${account.email}`);
    } catch (cause) {
      toast.error(toMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const syncAll = useCallback(async () => {
    setBusy("all");
    setError(null);

    try {
      await apiSend("/api/admin/accounts/sync", "POST");
      await load();
      notifyStorageChanged();
      toast.success("Quotas synced");
    } catch (cause) {
      toast.error(toMessage(cause));
    } finally {
      setBusy(null);
    }
  }, [load]);

  useEffect(() => {
    setActions(
      <ButtonGroup>
        <Button
          variant="outline"
          size="sm"
          aria-label="Sync quotas"
          onClick={() => void syncAll()}
          disabled={busy === "all"}
        >
          <IconRefresh />
          <span className="hidden sm:inline">Sync quotas</span>
        </Button>
        <Button asChild size="sm" aria-label="Connect account">
          <a href="/api/auth/google/start">
            <IconPlus />
            <span className="hidden sm:inline">Connect account</span>
          </a>
        </Button>
      </ButtonGroup>,
    );

    return () => {
      setActions(null);
    };
  }, [busy, setActions, syncAll]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Google accounts</CardTitle>
          <CardDescription>
            Connect multiple Google Drive accounts. Uploads go to the account
            with the most free space.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {connected && (
            <div className="border border-border bg-muted px-3 py-2 text-xs">
              Connected {connected}
            </div>
          )}
          {oauthError && (
            <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Google connection failed: {oauthError}
            </div>
          )}
          {error && (
            <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          {accounts === null ? (
            <Skeleton className="h-40 w-full" />
          ) : accounts.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No accounts connected yet. Click “Connect account” to add one.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Quota</TableHead>
                  <TableHead>Last sync</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => {
                  const percent = quotaPercent(
                    account.quotaLimit,
                    account.quotaUsage,
                  );

                  return (
                    <TableRow key={account.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {account.displayName ?? account.email}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {account.email}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(account.status)}>
                          {account.status}
                        </Badge>
                        {account.lastError && (
                          <p className="mt-1 max-w-52 truncate text-xs text-destructive">
                            {account.lastError}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex w-56 flex-col gap-1.5">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{formatBytes(account.quotaUsage)}</span>
                            <span>{formatBytes(account.quotaLimit)}</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden bg-muted">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${percent ?? 0}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatRelativeTime(account.lastQuotaSync)}
                        <div>{formatDate(account.lastQuotaSync)}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Actions for ${account.email}`}
                                disabled={busy === account.id}
                              >
                                <IconDotsVertical />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="min-w-48"
                            >
                              <DropdownMenuItem
                                onSelect={() => void refreshAccount(account)}
                                disabled={busy === account.id}
                              >
                                <IconRefresh />
                                Refresh quota
                              </DropdownMenuItem>
                              {account.status !== "disconnected" && (
                                <DropdownMenuItem
                                  onSelect={() => void toggleStatus(account)}
                                  disabled={busy === account.id}
                                >
                                  {account.status === "paused" ? (
                                    <IconPlayerPlay />
                                  ) : (
                                    <IconPlayerPause />
                                  )}
                                  {account.status === "paused"
                                    ? "Resume"
                                    : "Pause"}
                                </DropdownMenuItem>
                              )}
                              {account.status !== "disconnected" && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onSelect={() =>
                                      void disconnectAccount(account)
                                    }
                                    disabled={busy === account.id}
                                  >
                                    <IconTrash />
                                    Disconnect
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
