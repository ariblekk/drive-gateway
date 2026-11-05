"use client";

import { useEffect, useState } from "react";
import {
  IconBrandGoogle,
  IconChartPie,
  IconCloud,
  IconDatabase,
  IconFileStack,
  IconUsers,
} from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChartBarInteractive } from "@/components/chart-bar-interactive";

import {
  apiGet,
  FILES_CHANGED_EVENT,
  STORAGE_CHANGED_EVENT,
  toMessage,
} from "./client";
import { formatBytes, formatDate, quotaPercent } from "./format";
import type { OverviewResponse } from "./types";

export function OverviewCards() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = () => {
      apiGet<OverviewResponse>("/api/admin/overview")
        .then((response) => {
          if (active) {
            setData(response);
          }
        })
        .catch((cause) => {
          if (active) {
            setError(toMessage(cause));
          }
        });
    };

    load();
    window.addEventListener(STORAGE_CHANGED_EVENT, load);
    window.addEventListener(FILES_CHANGED_EVENT, load);

    return () => {
      active = false;
      window.removeEventListener(STORAGE_CHANGED_EVENT, load);
      window.removeEventListener(FILES_CHANGED_EVENT, load);
    };
  }, []);

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Could not load overview</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!data) {
    return (
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  const { stats, recentActivity } = data;

  const cards = [
    {
      label: "Connected accounts",
      value: String(stats.accounts),
      hint:
        stats.unlimitedAccounts > 0
          ? `${stats.unlimitedAccounts} unlimited`
          : "Google Drive accounts",
      icon: IconUsers,
    },
    {
      label: "Files",
      value: String(stats.totalFiles),
      hint: formatBytes(stats.totalFileBytes),
      icon: IconFileStack,
    },
    {
      label: "Storage used",
      value: formatBytes(stats.totalUsedBytes),
      hint: `of ${formatBytes(stats.totalLimitBytes)}`,
      icon: IconChartPie,
    },
    {
      label: "Free space",
      value: formatBytes(stats.totalFreeBytes),
      hint: "across all accounts",
      icon: IconCloud,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
        {cards.map((card) => (
          <Card key={card.label} className="@container/card">
            <CardHeader>
              <CardDescription>{card.label}</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                {card.value}
              </CardTitle>
              <CardAction>
                <card.icon className="size-5 text-muted-foreground" />
              </CardAction>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {card.hint}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Storage per account</CardTitle>
            <CardDescription>
              Accounts are filled in order of free space.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {stats.perAccount.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No Google accounts connected yet.
              </p>
            ) : (
              stats.perAccount.map((account) => {
                const percent = quotaPercent(
                  account.quotaLimit,
                  account.quotaUsage,
                );

                return (
                  <div key={account.id} className="flex flex-col gap-1.5">
                    <div className="flex items-start justify-between gap-2 text-xs">
                      <div className="flex min-w-0 items-start gap-2">
                        <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center border border-border bg-muted/40">
                          {account.provider === "s3" ? (
                            <IconDatabase className="size-3 text-blue-500" />
                          ) : (
                            <IconBrandGoogle className="size-3 text-amber-500" />
                          )}
                        </div>
                        <div className="flex min-w-0 flex-col">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium">
                              {account.displayName ?? account.email}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-[9px] uppercase px-1 py-0 h-4"
                            >
                              {account.provider === "s3" ? "S3" : "Drive"}
                            </Badge>
                          </div>
                          <span className="truncate text-xs text-muted-foreground">
                            {account.provider === "s3"
                              ? `${account.s3Bucket ?? "bucket"} @ ${account.s3Endpoint ?? ""}`
                              : account.email}
                          </span>
                        </div>
                      </div>
                      <span className="shrink-0 text-muted-foreground">
                        {formatBytes(account.quotaUsage)} /{" "}
                        {formatBytes(account.quotaLimit)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-none bg-muted">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${percent ?? 0}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Latest gateway operations.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="text-xs text-muted-foreground">No activity yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentActivity.slice(0, 5).map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="capitalize">
                        {entry.action}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            entry.status === "ok" ? "secondary" : "destructive"
                          }
                        >
                          {entry.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatBytes(entry.bytes)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(entry.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
      <ChartBarInteractive traffic={data.traffic} />
    </div>
  );
}
