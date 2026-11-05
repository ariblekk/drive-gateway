import type { ReactNode } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { HeaderProvider } from "@/components/gateway/header-provider";
import { UploadDialogProvider } from "@/components/gateway/upload-provider";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <UploadDialogProvider>
        <HeaderProvider>
          <AppSidebar variant="inset" />
          <SidebarInset>
            <SiteHeader />
            <div className="flex flex-1 flex-col">
              <div className="@container/main flex flex-1 flex-col gap-2">
                <div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
                  {children}
                </div>
              </div>
            </div>
          </SidebarInset>
        </HeaderProvider>
      </UploadDialogProvider>
    </SidebarProvider>
  );
}
