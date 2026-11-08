"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

const ROUTE_TITLES: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/files": "All Files",
  "/dashboard/trash": "Recycle Bin",
  "/dashboard/accounts": "Accounts & Quota",
  "/dashboard/activity": "Activity Log",
  "/dashboard/settings": "Settings",
  "/dashboard/api-keys": "API Keys",
  "/docs": "API Documentation",
};

interface HeaderContextValue {
  title: string;
  setCustomTitle: (title: string | null) => void;
  count: number | null;
  setCount: (count: number | null) => void;
  actions: ReactNode | null;
  setActions: (actions: ReactNode | null) => void;
}

const HeaderContext = createContext<HeaderContextValue | null>(null);

export function HeaderProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [customTitle, setCustomTitle] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [actions, setActions] = useState<ReactNode | null>(null);

  const normalized = pathname
    ? pathname.replace(/\/$/, "") || "/"
    : "/dashboard";
  const title =
    customTitle ?? ROUTE_TITLES[normalized] ?? "Storage Gateway";

  return (
    <HeaderContext.Provider
      value={{
        title,
        setCustomTitle,
        count,
        setCount,
        actions,
        setActions,
      }}
    >
      {children}
    </HeaderContext.Provider>
  );
}

export function useHeader(): HeaderContextValue {
  const context = useContext(HeaderContext);

  if (!context) {
    throw new Error("useHeader must be used within HeaderProvider");
  }

  return context;
}
