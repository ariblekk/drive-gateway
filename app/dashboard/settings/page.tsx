"use client";

import { useRef, useState } from "react";
import { IconDownload, IconUpload } from "@tabler/icons-react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

import { ApiError, toMessage } from "@/components/gateway/client";
import { S3CredentialsCard } from "@/components/gateway/s3-credentials-card";

export default function Page() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const downloadBackup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);

    try {
      const response = await fetch("/api/admin/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new ApiError(
          response.status,
          data?.error?.message ?? response.statusText ?? "Request failed",
        );
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        response.headers
          .get("Content-Disposition")
          ?.match(/filename="?([^";]+)"?/i)?.[1] ?? "drive-gateway-backup.json";
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Database backup downloaded.");
    } catch (cause) {
      toast.error(toMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const restoreBackup = async () => {
    if (!selectedFile) {
      return;
    }

    setBusy(true);

    try {
      const backup = JSON.parse(await selectedFile.text());
      const response = await fetch("/api/admin/restore", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": password,
        },
        body: JSON.stringify(backup),
      });
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new ApiError(
          response.status,
          result?.error?.message ?? response.statusText ?? "Request failed",
        );
      }

      setRestoreOpen(false);
      setSelectedFile(null);
      if (fileInput.current) {
        fileInput.current.value = "";
      }
      toast.success("Database backup restored.");
    } catch (cause) {
      toast.error(
        cause instanceof SyntaxError
          ? "The selected file is not valid JSON."
          : toMessage(cause),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Tabs defaultValue="general" className="flex flex-col gap-4">
      <TabsList>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="credentials">Credentials</TabsTrigger>
      </TabsList>
      <TabsContent value="general">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-sm font-medium">
              Database backup & restore
            </h2>
            <p className="text-xs/relaxed text-muted-foreground">
              Export or import gateway data to move configuration between
              instances.
            </p>
          </div>

          <form className="flex flex-col gap-3" onSubmit={downloadBackup}>
            <label htmlFor="backup-password" className="text-xs font-medium">
              Admin password
            </label>
            <Input
              id="backup-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" disabled={busy || !password}>
                <IconDownload />
                Download backup
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy || !password}
                onClick={() => fileInput.current?.click()}
              >
                <IconUpload />
                Select backup file
              </Button>
              <Input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(event) =>
                  setSelectedFile(event.target.files?.[0] ?? null)
                }
              />
            </div>
            {selectedFile && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate">
                  {selectedFile.name}
                </span>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy || !password}
                  onClick={() => setRestoreOpen(true)}
                >
                  Restore backup
                </Button>
              </div>
            )}
          </form>

          <AlertDialog open={restoreOpen} onOpenChange={setRestoreOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Restore this backup?</AlertDialogTitle>
                <AlertDialogDescription>
                  Records in the backup will be merged into this instance and may
                  update matching credentials or configuration. Existing records
                  absent from the backup will remain. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={busy}
                  onClick={(event) => {
                    event.preventDefault();
                    void restoreBackup();
                  }}
                >
                  {busy ? "Restoring…" : "Restore backup"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TabsContent>
      <TabsContent value="credentials">
        <S3CredentialsCard />
      </TabsContent>
    </Tabs>
  );
}
