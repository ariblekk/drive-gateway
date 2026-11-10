"use client";

import { IconDownload, IconEye, IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { isInlineSafe, resolveContentType } from "@/lib/preview";

import { formatBytes, formatDate } from "../format";
import type { FileItem } from "../types";

function canPreview(file: FileItem): boolean {
  return isInlineSafe(resolveContentType(null, file.mimeType, file.name));
}

export function FileDetailSheet({
  file,
  onClose,
  onDelete,
}: {
  file: FileItem | null;
  onClose: () => void;
  onDelete: (file: FileItem) => void;
}) {
  return (
    <Sheet open={file !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        {file && (
          <>
            <SheetHeader>
              <SheetTitle className="break-all pr-8">{file.name}</SheetTitle>
              <SheetDescription>File details</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-0 px-4">
              {[
                ["Size", formatBytes(file.size)],
                ["Type", file.mimeType ?? "—"],
                ["Account", file.accountEmail ?? "—"],
                ["Folder", file.path],
                ["Status", file.status],
                ["Created", formatDate(file.createdAt)],
                ["Updated", formatDate(file.updatedAt)],
                ["ID", file.id],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex flex-col gap-0.5 border-b border-border py-2 last:border-b-0"
                >
                  <span className="text-[11px] uppercase text-muted-foreground">
                    {label}
                  </span>
                  <span className="break-all">{value}</span>
                </div>
              ))}
            </div>
            <SheetFooter className="flex-row justify-end gap-2">
              {canPreview(file) && (
                <Button variant="outline" asChild>
                  <a
                    href={`/api/admin/files/${file.id}/preview`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <IconEye />
                    Preview
                  </a>
                </Button>
              )}
              <Button variant="outline" asChild>
                <a
                  href={`/api/admin/files/${file.id}/download`}
                  onClick={() => toast.info(`Downloading ${file.name}`)}
                >
                  <IconDownload />
                  Download
                </a>
              </Button>
              <Button variant="destructive" onClick={() => onDelete(file)}>
                <IconTrash />
                Delete
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}