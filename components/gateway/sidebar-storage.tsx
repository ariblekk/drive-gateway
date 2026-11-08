"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import {
  IconFileText,
  IconPhoto,
  IconVideo,
} from "@tabler/icons-react";

import { Progress } from "@/components/ui/progress";
import {
  SidebarGroup,
  SidebarGroupContent,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

import { apiGet, STORAGE_CHANGED_EVENT } from "./client";
import { formatBytes, quotaPercent } from "./format";
import type { StorageSummary } from "./types";

const ROWS = [
  { key: "photos", label: "Photo", icon: IconPhoto, color: "text-green-500" },
  { key: "videos", label: "Video", icon: IconVideo, color: "text-yellow-500" },
  {
    key: "documents",
    label: "Document",
    icon: IconFileText,
    color: "text-cyan-500",
  },
] as const;

export function SidebarStorage() {
  const pathname = usePathname();
  const [summary, setSummary] = useState<StorageSummary | null>(null);

  useEffect(() => {
    let active = true;

    const load = () => {
      apiGet<StorageSummary>("/api/admin/storage")
        .then((data) => {
          if (active) {
            setSummary(data);
          }
        })
        .catch(() => {
          // Best effort; page-level views surface their own errors.
        });
    };

    load();
    window.addEventListener(STORAGE_CHANGED_EVENT, load);

    return () => {
      active = false;
      window.removeEventListener(STORAGE_CHANGED_EVENT, load);
    };
  }, [pathname]);

  const percent = summary
    ? quotaPercent(summary.limitBytes, summary.indexedBytes)
    : null;

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupContent>
        <div className="flex flex-col gap-3 px-2 py-1 text-xs">
          {summary ? (
            <>
              <div className="flex flex-col gap-2">
                {ROWS.map((row) => (
                  <div
                    key={row.key}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="flex items-center gap-2">
                      <span className="flex size-4 shrink-0 items-center justify-center">
                        <row.icon className={cn("size-4", row.color)} />
                      </span>
                      <span>{row.label}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-foreground">
                      {formatBytes(summary.breakdown[row.key].bytes)}
                    </span>
                  </div>
                ))}

              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-foreground">
                    {formatBytes(summary.indexedBytes)} used in project
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {summary.unlimitedAccounts > 0
                      ? "Unlimited"
                      : formatBytes(summary.limitBytes)}
                  </span>
                </div>
                <Progress value={percent} className="h-2" />
              </div>
            </>
          ) : (
            <Skeleton className="h-32 w-full" />
          )}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
