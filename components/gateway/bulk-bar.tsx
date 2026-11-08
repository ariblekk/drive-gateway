"use client";

import type { ReactNode } from "react";
import { IconX } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";

export function BulkBar({
  selectedCount,
  onClear,
  busy = false,
  children,
}: {
  selectedCount: number;
  onClear: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4"
    >
      <div className="flex w-full max-w-3xl flex-row items-center justify-between gap-2 border border-border bg-background/95 px-3 py-2 text-xs shadow-sm backdrop-blur sm:w-auto sm:min-w-[36rem] sm:gap-4">
        <span className="whitespace-nowrap font-medium">
          {selectedCount} selected
        </span>
        <div className="ml-auto flex shrink-0 items-center justify-end gap-1">
          <ButtonGroup>{children}</ButtonGroup>
          <Button
            variant="ghost"
            onClick={onClear}
            disabled={busy}
            aria-label="Clear selection"
            title="Clear selection"
          >
            <IconX className="sm:hidden" />
            <span className="hidden sm:inline">Clear</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
