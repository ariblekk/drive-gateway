"use client";

import { useEffect, useState } from "react";
import { cn } from "cn";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
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
import { formatBytes, formatDate } from "./format";
import type { OverviewResponse } from "./types";

function ProjectNode({ data }: { data: { label: string; sublabel: string } }) {
  return (
    <div className="relative flex flex-col items-center justify-center border border-primary/50 bg-primary/10 px-4 py-2 text-center shadow-xs">
      <Handle
        type="source"
        position={Position.Top}
        id="top"
        className="!size-0 !border-0 !bg-transparent"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!size-0 !border-0 !bg-transparent"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!size-0 !border-0 !bg-transparent"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left"
        className="!size-0 !border-0 !bg-transparent"
      />
      <span className="text-sm font-semibold">{data.label}</span>
      <span className="text-xs text-muted-foreground">{data.sublabel}</span>
    </div>
  );
}

function AccountNode({
  data,
}: {
  data: {
    name: string;
    subtext: string;
    provider: "google" | "s3";
    isLatest: boolean;
  };
}) {
  return (
    <div
      className={cn(
        "flex w-44 items-center gap-2.5 border bg-card px-3 py-2 shadow-xs transition-all",
        data.isLatest
          ? "border-primary ring-2 ring-primary/20 shadow-primary/10 shadow-md"
          : "border-border",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!size-0 !border-0 !bg-transparent"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="right"
        className="!size-0 !border-0 !bg-transparent"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="bottom"
        className="!size-0 !border-0 !bg-transparent"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!size-0 !border-0 !bg-transparent"
      />

      <span className="flex size-7 shrink-0 items-center justify-center bg-muted">
        {data.provider === "s3" ? (
          <IconDatabase className="size-4 text-blue-500" />
        ) : (
          <IconBrandGoogle className="size-4 text-amber-500" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-medium">{data.name}</span>
        </div>
        <div className="truncate text-[10px] text-muted-foreground">
          {data.subtext}
        </div>
      </div>
    </div>
  );
}

const nodeTypes = {
  project: ProjectNode,
  account: AccountNode,
};

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
      label: "Storage used in project",
      value: formatBytes(stats.totalFileBytes),
      hint: `of ${formatBytes(stats.totalLimitBytes)} account capacity`,
      icon: IconChartPie,
    },
    {
      label: "Free space",
      value: formatBytes(stats.totalFreeBytes),
      hint: "across all accounts",
      icon: IconCloud,
    },
  ];

  // ponytail: simplified 4-cardinal directional handles; upgrade to dynamic edge-crossing layout if accounts > 30
  const latestUsedAt = Math.max(
    ...stats.perAccount.map((item) => item.lastUsedAt ?? 0),
  );
  const accountCount = stats.perAccount.length;
  const rx = Math.max(260, (accountCount * 190) / (2 * Math.PI));
  const ry = Math.max(140, rx * 0.55);

  const topologyNodes: Node[] = [
    {
      id: "project",
      type: "project",
      position: { x: -80, y: -28 },
      data: {
        label: "Drive Gateway",
        sublabel: `${formatBytes(stats.totalFileBytes)} stored`,
      },
    },
    ...stats.perAccount.map((account, index) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * index) / (accountCount || 1);
      const cx = rx * Math.cos(angle);
      const cy = ry * Math.sin(angle);
      const isLatest =
        account.lastUsedAt != null && account.lastUsedAt === latestUsedAt;

      return {
        id: account.id,
        type: "account",
        position: { x: cx - 88, y: cy - 26 },
        data: {
          name: account.email,
          subtext: `${formatBytes(account.projectUsageBytes)} / ${
            account.quotaLimit === null
              ? "Unlimited"
              : formatBytes(account.quotaLimit)
          }`,
          provider: account.provider ?? "google",
          isLatest,
        },
      };
    }),
  ];

  const topologyEdges: Edge[] = stats.perAccount.map((account, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / (accountCount || 1);
    const cx = rx * Math.cos(angle);
    const isLatest =
      account.lastUsedAt != null && account.lastUsedAt === latestUsedAt;

    let sourceHandle: "top" | "bottom" | "left" | "right";
    let targetHandle: "top" | "bottom" | "left" | "right";

    if (
      Math.abs(angle + Math.PI / 2) < Math.PI / 4 ||
      Math.abs(angle - (3 * Math.PI) / 2) < Math.PI / 4
    ) {
      sourceHandle = "top";
      targetHandle = "bottom";
    } else if (Math.abs(angle - Math.PI / 2) < Math.PI / 4) {
      sourceHandle = "bottom";
      targetHandle = "top";
    } else if (cx > 0) {
      sourceHandle = "right";
      targetHandle = "left";
    } else {
      sourceHandle = "left";
      targetHandle = "right";
    }

    return {
      id: `project-${account.id}`,
      source: "project",
      sourceHandle,
      target: account.id,
      targetHandle,
      animated: false,
      style: {
        stroke:
          account.status === "paused"
            ? "var(--muted-foreground)"
            : isLatest
              ? "var(--primary)"
              : "var(--border)",
        strokeDasharray: account.status === "paused" ? "5 5" : "none",
        strokeWidth: isLatest && account.status !== "paused" ? 2.5 : 1.25,
        opacity: account.status === "paused" ? 0.6 : isLatest ? 1 : 0.6,
      },
    };
  });

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
              Storage account connections and most recent upload target.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stats.perAccount.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No storage accounts connected yet.
              </p>
            ) : (
              <div>
                <div className="h-72 w-full overflow-hidden border bg-muted/10 sm:h-96">
                  <ReactFlow
                    nodes={topologyNodes}
                    edges={topologyEdges}
                    nodeTypes={nodeTypes}
                    fitView
                    fitViewOptions={{ padding: 0.2 }}
                    minZoom={0.4}
                    maxZoom={2}
                    zoomOnScroll
                    zoomActivationKeyCode="Control"
                    zoomOnPinch
                    panOnDrag
                    elementsSelectable={false}
                    nodesDraggable={false}
                    nodesConnectable={false}
                    proOptions={{ hideAttribution: true }}
                  >
                    <Background color="var(--border)" gap={20} size={1} />
                    <Controls showInteractive={false} />
                  </ReactFlow>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className="h-px w-5 bg-border" />
                    Connected
                  </span>
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="w-5 border-t border-dashed border-muted-foreground"
                    />
                    Paused
                  </span>
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className="h-0.5 w-5 bg-primary" />
                    Last used
                  </span>
                </div>
              </div>
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
                    <TableHead>Target</TableHead>
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
                      <TableCell
                        className="max-w-[140px] truncate text-muted-foreground"
                        title={entry.accountEmail ?? "-"}
                      >
                        {entry.accountEmail ?? "-"}
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
