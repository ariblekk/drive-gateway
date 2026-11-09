"use client";

import { useHeader } from "@/components/gateway/header-provider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function SiteHeader() {
  const { title, titleContent, count, actions } = useHeader();

  return (
    <header className="sticky top-0 z-10 flex h-(--header-height) shrink-0 items-center gap-2 border-b bg-background transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center justify-between gap-2 px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-1.5 lg:gap-2">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mx-2 data-[orientation=vertical]:h-4"
          />
          {titleContent ?? (
            <>
              <h1 className="truncate text-base font-medium">{title}</h1>
              {count !== null && (
                <Badge variant="secondary" className="text-xs tabular-nums">
                  {count}
                </Badge>
              )}
            </>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
