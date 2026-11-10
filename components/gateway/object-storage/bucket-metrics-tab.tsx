"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
} from "recharts";

import { Card } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

import { apiGet, toMessage } from "../client";
import { formatBytes } from "../format";
import type { BucketItem, BucketMetrics } from "../types";

const retrievedConfig = {
  retrievedBytes: {
    label: "Retrieved",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const requestsConfig = {
  count: {
    label: "Requests",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

export function BucketMetricsTab({
  buckets,
  selectedBucket,
}: {
  buckets: BucketItem[];
  selectedBucket: string;
}) {
  const [metrics, setMetrics] = useState<BucketMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    apiGet<BucketMetrics>(
      `/api/admin/buckets/${encodeURIComponent(selectedBucket)}/metrics`,
    )
      .then((data) => {
        if (active) {
          setMetrics(data);
          setError(null);
        }
      })
      .catch((cause) => {
        if (active) setError(toMessage(cause));
      });

    return () => {
      active = false;
    };
  }, [selectedBucket]);

  const bucket = buckets.find((item) => item.name === selectedBucket);
  // ponytail: no storage-history snapshots; average = totalBytes / objectCount.
  // Add a daily snapshot table if average-over-time is needed.
  const averageStorage =
    bucket && bucket.objectCount > 0
      ? bucket.totalBytes / bucket.objectCount
      : 0;
  const topAction = metrics?.distribution[0];

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="gap-1 p-4">
          <p className="text-xs text-muted-foreground">Average Storage</p>
          <p className="text-2xl font-medium tabular-nums">
            {formatBytes(averageStorage)}
          </p>
          <p className="text-xs text-muted-foreground">per object</p>
        </Card>
        <Card className="gap-1 p-4">
          <p className="text-xs text-muted-foreground">Data Retrieved</p>
          <p className="text-2xl font-medium tabular-nums">
            {formatBytes(metrics?.dataRetrievedBytes ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground">
            last {metrics?.rangeDays ?? 30} days
          </p>
        </Card>
        <Card className="gap-1 p-4">
          <p className="text-xs text-muted-foreground">Request Distribution</p>
          <p className="text-2xl font-medium tabular-nums">
            {(metrics?.requestCount ?? 0).toLocaleString()} requests
          </p>
          <p className="text-xs text-muted-foreground">
            {topAction
              ? `top: ${topAction.action} (${topAction.count})`
              : "no requests yet"}
          </p>
        </Card>
      </div>

      <Card className="gap-3 p-4">
        <div>
          <h2 className="text-sm font-medium">Data retrieved</h2>
          <p className="text-xs text-muted-foreground">
            Bytes downloaded from this bucket over the last{" "}
            {metrics?.rangeDays ?? 30} days.
          </p>
        </div>
        <ChartContainer
          config={retrievedConfig}
          className="aspect-auto h-[220px] w-full"
        >
          <AreaChart data={metrics?.traffic ?? []}>
            <defs>
              <linearGradient id="fillRetrieved" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--chart-1)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--chart-1)"
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) =>
                new Date(value).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              }
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) =>
                    new Date(value).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  }
                  formatter={(value) => (
                    <div className="flex min-w-32 items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">Retrieved</span>
                      <span className="font-mono font-medium text-foreground">
                        {formatBytes(Number(value))}
                      </span>
                    </div>
                  )}
                  indicator="dot"
                />
              }
            />
            <Area
              dataKey="retrievedBytes"
              type="natural"
              fill="url(#fillRetrieved)"
              stroke="var(--chart-1)"
            />
          </AreaChart>
        </ChartContainer>
      </Card>

      <Card className="gap-3 p-4">
        <div>
          <h2 className="text-sm font-medium">Request distribution</h2>
          <p className="text-xs text-muted-foreground">
            Requests by action over the last {metrics?.rangeDays ?? 30} days.
          </p>
        </div>
        <ChartContainer
          config={requestsConfig}
          className="aspect-auto h-[220px] w-full"
        >
          <BarChart data={metrics?.distribution ?? []}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="action"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="dot" />}
            />
            <Bar dataKey="count" fill="var(--chart-2)" radius={4} />
          </BarChart>
        </ChartContainer>
      </Card>
    </div>
  );
}