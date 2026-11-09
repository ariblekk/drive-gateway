"use client";

import Link from "next/link";
import {
  IconCloudComputing,
  IconChartPie,
  IconCloud,
  IconFileStack,
  IconHistory,
} from "@tabler/icons-react";

import { SidebarStorage } from "@/components/gateway/sidebar-storage";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const data = {
  user: {
    name: "Gateway admin",
    email: "admin@localhost",
    avatar: "/avatars/shadcn.jpg",
  },
  navMain: [
    {
      title: "Overview",
      url: "/dashboard",
      icon: IconChartPie,
    },
    {
      title: "All Files",
      url: "/dashboard/files",
      icon: IconFileStack,
    },
    {
      title: "Accounts & Quota",
      url: "/dashboard/accounts",
      icon: IconCloud,
    },
    {
      title: "Activity Log",
      url: "/dashboard/activity",
      icon: IconHistory,
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5! group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2!"
            >
              <Link href="/dashboard">
                <IconCloudComputing className="size-5!" />
                <span className="text-base font-semibold group-data-[collapsible=icon]:hidden">
                  Drive Gateway
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <div className="mt-auto group-data-[collapsible=icon]:hidden">
          <SidebarStorage />
        </div>
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  );
}
