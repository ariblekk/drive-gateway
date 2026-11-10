"use client";

import { useEffect, useState } from "react";
import {
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { apiGet, toMessage } from "./client";
import { formatBytes, formatDate } from "./format";
import type { ActivityItem } from "./types";

const PAGE_SIZE = 20;

export function ActivityView() {
  const [activity, setActivity] = useState<ActivityItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    apiGet<{ activity: ActivityItem[]; total: number }>(
      `/api/admin/activity?limit=${PAGE_SIZE}&offset=${offset}`,
    )
      .then((data) => {
        if (active) {
          setActivity(data.activity);
          setTotal(data.total);
          setError(null);
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
  }, [offset]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-sm font-medium">Activity log</h2>
        <p className="text-xs/relaxed text-muted-foreground">
          Uploads, downloads, deletions, and errors from the gateway.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {error && (
          <div className="mb-3 border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {activity === null ? (
          <Skeleton className="h-40 w-full" />
        ) : activity.length === 0 ? (
          <p className="text-xs text-muted-foreground">No activity yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <Card className="p-0">
              <Table>
                <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activity.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(entry.createdAt)}
                    </TableCell>
                    <TableCell className="capitalize">
                      {entry.action}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          entry.status === "ok"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {entry.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {entry.accountEmail ?? "—"}
                    </TableCell>
                    <TableCell>{formatBytes(entry.bytes)}</TableCell>
                    <TableCell className="max-w-72 truncate text-xs text-muted-foreground">
                      {entry.message ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

            <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>
                {from}–{to} of {total}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setOffset(Math.max(0, offset - PAGE_SIZE))
                  }
                  disabled={offset === 0}
                >
                  <IconChevronLeft />
                  Previous
                </Button>
                <span>
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  disabled={offset + PAGE_SIZE >= total}
                >
                  Next
                  <IconChevronRight />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
