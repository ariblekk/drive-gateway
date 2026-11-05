"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

import { UploadDialog } from "./upload-dialog";

interface UploadDialogContextValue {
  openUploadDialog: (folderId?: string | null) => void;
}

const UploadDialogContext =
  createContext<UploadDialogContextValue | null>(null);

export function UploadDialogProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [defaultFolderId, setDefaultFolderId] = useState<
    string | null
  >(null);
  const [dialogKey, setDialogKey] = useState(0);

  const openUploadDialog = (folderId: string | null = null) => {
    setDefaultFolderId(folderId);
    setDialogKey((key) => key + 1);
    setOpen(true);
  };

  return (
    <UploadDialogContext.Provider value={{ openUploadDialog }}>
      {children}
      <UploadDialog
        key={dialogKey}
        open={open}
        onOpenChange={setOpen}
        defaultFolderId={defaultFolderId}
      />
    </UploadDialogContext.Provider>
  );
}

export function useUploadDialog(): UploadDialogContextValue {
  const context = useContext(UploadDialogContext);

  if (!context) {
    throw new Error(
      "useUploadDialog must be used within UploadDialogProvider",
    );
  }

  return context;
}
