"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  IconBrandGoogle,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconChevronsLeft,
  IconChevronsRight,
  IconDatabase,
  IconDotsVertical,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";

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
import { ButtonGroup } from "@/components/ui/button-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
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

import { apiGet, apiSend, notifyStorageChanged, toMessage } from "./client";
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
  const [quotaSort, setQuotaSort] = useState<"asc" | "desc">("asc");
  const [pageSize, setPageSize] = useState(10);
  const [pageIndex, setPageIndex] = useState(0);
  const { setActions } = useHeader();

  const [connectS3Open, setConnectS3Open] = useState(false);
  const [connectingS3, setConnectingS3] = useState(false);
  const [s3Name, setS3Name] = useState("");
  const [s3Endpoint, setS3Endpoint] = useState("");
  const [s3Bucket, setS3Bucket] = useState("");
  const [s3Region, setS3Region] = useState("us-east-1");
  const [s3AccessKeyId, setS3AccessKeyId] = useState("");
  const [s3SecretAccessKey, setS3SecretAccessKey] = useState("");
  const [s3QuotaValue, setS3QuotaValue] = useState("");
  const [s3QuotaUnit, setS3QuotaUnit] = useState<"GB" | "TB">("GB");
  const [s3ForcePathStyle, setS3ForcePathStyle] = useState(true);
  const [accountToDisconnect, setAccountToDisconnect] =
    useState<Account | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

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

  const confirmDisconnect = async () => {
    if (!accountToDisconnect) {
      return;
    }

    setDisconnecting(true);
    setError(null);

    try {
      await apiSend(`/api/admin/accounts/${accountToDisconnect.id}`, "DELETE");
      await load();
      notifyStorageChanged();
      toast.success(
        `Disconnected ${accountToDisconnect.displayName ?? accountToDisconnect.email}`,
      );
      setAccountToDisconnect(null);
    } catch (cause) {
      toast.error(toMessage(cause));
    } finally {
      setDisconnecting(false);
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

  const handleConnectS3 = async (event: React.FormEvent) => {
    event.preventDefault();
    if (
      !s3Name.trim() ||
      !s3Endpoint.trim() ||
      !s3Bucket.trim() ||
      !s3AccessKeyId.trim() ||
      !s3SecretAccessKey.trim()
    ) {
      toast.error("Please fill in all required fields.");
      return;
    }

    const numQuota = Number(s3QuotaValue);
    const quotaLimit =
      s3QuotaValue.trim() && Number.isFinite(numQuota) && numQuota > 0
        ? Math.floor(
            numQuota *
              (s3QuotaUnit === "TB"
                ? 1024 * 1024 * 1024 * 1024
                : 1024 * 1024 * 1024),
          )
        : null;

    setConnectingS3(true);

    try {
      await apiSend("/api/admin/accounts/s3", "POST", {
        name: s3Name.trim(),
        endpoint: s3Endpoint.trim(),
        bucket: s3Bucket.trim(),
        region: s3Region.trim() || "us-east-1",
        accessKeyId: s3AccessKeyId.trim(),
        secretAccessKey: s3SecretAccessKey.trim(),
        quotaLimit,
        forcePathStyle: s3ForcePathStyle,
      });

      toast.success(`Connected S3 storage "${s3Name.trim()}"`);
      setConnectS3Open(false);
      setS3Name("");
      setS3Endpoint("");
      setS3Bucket("");
      setS3AccessKeyId("");
      setS3SecretAccessKey("");
      setS3QuotaValue("");
      await load();
      notifyStorageChanged();
    } catch (cause) {
      toast.error(toMessage(cause));
    } finally {
      setConnectingS3(false);
    }
  };

  useEffect(() => {
    setActions(
      <ButtonGroup>
        <Button
          variant="outline"
          aria-label="Sync quotas"
          onClick={() => void syncAll()}
          disabled={busy === "all"}
        >
          <IconRefresh />
          <span className="hidden sm:inline">Sync quotas</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="Connect account">
              <IconPlus />
              <span className="hidden sm:inline">Connect account</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a href="/api/auth/google/start">
                <IconBrandGoogle />
                Google Drive
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setConnectS3Open(true)}>
              <IconDatabase />
              S3 Storage
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>,
    );

    return () => {
      setActions(null);
    };
  }, [busy, setActions, syncAll]);

  const filteredAccounts = [...(accounts ?? [])].sort((a, b) => {
    const aPercent = quotaPercent(a.quotaLimit, a.quotaUsage) ?? 0;
    const bPercent = quotaPercent(b.quotaLimit, b.quotaUsage) ?? 0;
    return quotaSort === "asc" ? aPercent - bPercent : bPercent - aPercent;
  });

  const totalPages = Math.max(1, Math.ceil(filteredAccounts.length / pageSize));
  const currentPage = Math.min(pageIndex + 1, totalPages);
  const pagedAccounts = filteredAccounts.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-sm font-medium">
            Connected accounts
          </h2>
          <p className="text-xs/relaxed text-muted-foreground">
            Google Drive & S3 accounts (Cloudflare R2, MinIO, Wasabi, AWS S3).
            Uploads go to the account with the most free space.
          </p>
        </div>
        <div className="flex flex-col gap-3">
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
          ) : filteredAccounts.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No accounts match the quota filter.
            </p>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted">
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-2 h-8"
                      aria-label={`Sort by quota ${quotaSort === "asc" ? "descending" : "ascending"}`}
                      onClick={() => {
                        setQuotaSort((sort) => (sort === "asc" ? "desc" : "asc"));
                        setPageIndex(0);
                      }}
                    >
                      Quota
                      {quotaSort === "asc" ? (
                        <IconChevronUp className="size-3.5" />
                      ) : (
                        <IconChevronDown className="size-3.5" />
                      )}
                    </Button>
                  </TableHead>
                  <TableHead>Last sync</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedAccounts.map((account) => {
                  const percent = quotaPercent(
                    account.quotaLimit,
                    account.quotaUsage,
                  );

                  return (
                    <TableRow key={account.id}>
                      <TableCell>
                        <div className="flex items-start gap-2.5">
                          <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center border border-border bg-muted/40">
                            {account.provider === "s3" ? (
                              <IconDatabase className="size-3.5 text-blue-500" />
                            ) : (
                              <IconBrandGoogle className="size-3.5 text-amber-500" />
                            )}
                          </div>
                          <div className="flex min-w-0 flex-col">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-medium">
                                {account.displayName ?? account.email}
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[10px] uppercase"
                              >
                                {account.provider === "s3" ? "S3" : "Drive"}
                              </Badge>
                            </div>
                            <span className="truncate text-xs text-muted-foreground">
                              {account.provider === "s3"
                                ? `${account.s3Bucket} @ ${account.s3Endpoint}`
                                : account.email}
                            </span>
                          </div>
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
                              {account.provider === "google" && (
                                <DropdownMenuItem asChild>
                                  <a href="/api/auth/google/start">
                                    <IconBrandGoogle />
                                    Reconnect Google Drive
                                  </a>
                                </DropdownMenuItem>
                              )}
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
                                      setAccountToDisconnect(account)
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

          {filteredAccounts.length > 0 && (
            <div className="flex items-center justify-between border-t border-border pt-3">
              <div className="hidden flex-1 text-sm text-muted-foreground lg:flex">
                {`${Math.min(
                  (currentPage - 1) * pageSize + 1,
                  filteredAccounts.length,
                )}–${Math.min(
                  currentPage * pageSize,
                  filteredAccounts.length,
                )} of ${filteredAccounts.length}`}
              </div>
              <div className="flex w-full items-center gap-8 lg:w-fit">
                <div className="hidden items-center gap-2 lg:flex">
                  <Label
                    htmlFor="accounts-rows-per-page"
                    className="text-sm font-medium"
                  >
                    Rows per page
                  </Label>
                  <Select
                    value={`${pageSize}`}
                    onValueChange={(value) => {
                      setPageSize(Number(value));
                      setPageIndex(0);
                    }}
                  >
                    <SelectTrigger
                      size="sm"
                      className="w-20"
                      id="accounts-rows-per-page"
                    >
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
                    onClick={() => setPageIndex(0)}
                    disabled={currentPage === 1}
                  >
                    <span className="sr-only">Go to first page</span>
                    <IconChevronsLeft />
                  </Button>
                  <Button
                    variant="outline"
                    className="size-8"
                    size="icon"
                    onClick={() => setPageIndex(currentPage - 2)}
                    disabled={currentPage === 1}
                  >
                    <span className="sr-only">Go to previous page</span>
                    <IconChevronLeft />
                  </Button>
                  <Button
                    variant="outline"
                    className="size-8"
                    size="icon"
                    onClick={() => setPageIndex(currentPage)}
                    disabled={currentPage === totalPages}
                  >
                    <span className="sr-only">Go to next page</span>
                    <IconChevronRight />
                  </Button>
                  <Button
                    variant="outline"
                    className="hidden size-8 lg:flex"
                    size="icon"
                    onClick={() => setPageIndex(totalPages - 1)}
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
      </div>

      <Dialog open={connectS3Open} onOpenChange={setConnectS3Open}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect S3 Storage</DialogTitle>
            <DialogDescription>
              Add an S3-compatible backend (Cloudflare R2, MinIO, Wasabi, AWS
              S3). The gateway will test the connection before saving.
            </DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-3" onSubmit={handleConnectS3}>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="s3-backend-name" className="text-xs font-medium">
                Account name
              </label>
              <Input
                id="s3-backend-name"
                value={s3Name}
                onChange={(e) => setS3Name(e.target.value)}
                placeholder="Cloudflare R2 Free"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="s3-backend-endpoint"
                className="text-xs font-medium"
              >
                Endpoint URL
              </label>
              <Input
                id="s3-backend-endpoint"
                value={s3Endpoint}
                onChange={(e) => setS3Endpoint(e.target.value)}
                placeholder="https://<account_id>.r2.cloudflarestorage.com"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="s3-backend-bucket"
                  className="text-xs font-medium"
                >
                  Bucket name
                </label>
                <Input
                  id="s3-backend-bucket"
                  value={s3Bucket}
                  onChange={(e) => setS3Bucket(e.target.value)}
                  placeholder="my-bucket"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="s3-backend-region"
                  className="text-xs font-medium"
                >
                  Region
                </label>
                <Input
                  id="s3-backend-region"
                  value={s3Region}
                  onChange={(e) => setS3Region(e.target.value)}
                  placeholder="auto or us-east-1"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="s3-backend-access-key"
                className="text-xs font-medium"
              >
                Access Key ID
              </label>
              <Input
                id="s3-backend-access-key"
                value={s3AccessKeyId}
                onChange={(e) => setS3AccessKeyId(e.target.value)}
                placeholder="Access key"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="s3-backend-secret-key"
                className="text-xs font-medium"
              >
                Secret Access Key
              </label>
              <Input
                id="s3-backend-secret-key"
                type="password"
                value={s3SecretAccessKey}
                onChange={(e) => setS3SecretAccessKey(e.target.value)}
                placeholder="Secret access key"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">
                Storage Quota (for routing)
              </label>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={s3QuotaValue}
                  onChange={(e) => setS3QuotaValue(e.target.value)}
                  placeholder="Unlimited"
                  className="flex-1"
                />
                <Select
                  value={s3QuotaUnit}
                  onValueChange={(val) => setS3QuotaUnit(val as "GB" | "TB")}
                >
                  <SelectTrigger className="w-18">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="GB">GB</SelectItem>
                      <SelectItem value="TB">TB</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="s3-backend-path-style"
                checked={s3ForcePathStyle}
                onCheckedChange={(val) => setS3ForcePathStyle(Boolean(val))}
              />
              <label
                htmlFor="s3-backend-path-style"
                className="text-xs text-muted-foreground cursor-pointer"
              >
                Use path-style addressing (MinIO, Ceph, Localstack)
              </label>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConnectS3Open(false)}
                disabled={connectingS3}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={connectingS3}>
                {connectingS3 ? "Testing & Connecting…" : "Connect"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={accountToDisconnect !== null}
        onOpenChange={(open) => {
          if (!open && !disconnecting) {
            setAccountToDisconnect(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Disconnect{" "}
              {accountToDisconnect?.displayName ?? accountToDisconnect?.email}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Stored files will remain on the remote storage, but this account
              will no longer be used by the gateway. Remove or move active files
              before disconnecting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnecting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={disconnecting}
              onClick={(event) => {
                event.preventDefault();
                void confirmDisconnect();
              }}
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
