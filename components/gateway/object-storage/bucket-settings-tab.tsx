"use client";

import { useSyncExternalStore } from "react";
import { IconTrash } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { formatBytes, formatDate } from "../format";
import type { Account, BucketItem } from "../types";

const subscribeToNothing = () => () => {};

export function BucketSettingsTab({
  bucket,
  accounts,
  onDelete,
}: {
  bucket: BucketItem | undefined;
  accounts: Account[];
  onDelete: () => void;
}) {
  const storageAccount = bucket?.storageAccountId
    ? (accounts.find((account) => account.id === bucket.storageAccountId)
        ?.email ?? bucket.storageAccountId)
    : "Auto (by free space)";

  // Runtime origin, not build-time env: NEXT_PUBLIC_* is inlined at build and
  // absent in the Docker build, which rendered a bare "/s3" in production.
  const origin = useSyncExternalStore(
    subscribeToNothing,
    () => window.location.origin,
    () => "",
  );
  const endpoint = `${origin}/s3`;

  return (
    <>
      <Card className="gap-4 p-4">
        <h2 className="text-sm font-medium">Bucket details</h2>
        <dl className="grid gap-4 text-xs sm:grid-cols-2">
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] uppercase text-muted-foreground">
              Bucket name
            </dt>
            <dd className="break-all font-medium">{bucket?.name ?? "—"}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] uppercase text-muted-foreground">
              S3 API endpoint
            </dt>
            <dd className="flex flex-col gap-1">
              <code className="break-all text-xs">{endpoint}</code>
              <span className="text-muted-foreground">
                {`path-style · ${endpoint}/${bucket?.name ?? "bucket"}`}
              </span>
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] uppercase text-muted-foreground">
              Created
            </dt>
            <dd>{bucket ? formatDate(bucket.createdAt) : "—"}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] uppercase text-muted-foreground">
              Storage account
            </dt>
            <dd className="break-all">{storageAccount}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] uppercase text-muted-foreground">
              Objects
            </dt>
            <dd className="tabular-nums">{bucket?.objectCount ?? 0}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] uppercase text-muted-foreground">
              Size
            </dt>
            <dd className="tabular-nums">
              {formatBytes(bucket?.totalBytes ?? 0)}
            </dd>
          </div>
        </dl>
      </Card>
      <Card className="flex flex-col gap-3 p-4">
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
          <CardDescription>
            Deleting a bucket permanently removes its objects from the backing
          </CardDescription>
        </CardHeader>

        <CardFooter className="justify-end gap-2">
          <Button
            variant="destructive"
            className="w-fit"
            disabled={!bucket || bucket.name === "default"}
            onClick={onDelete}
          >
            <IconTrash />
            Delete bucket
          </Button>
        </CardFooter>
      </Card>
    </>
  );
}
