import crypto from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import { recordActivity } from "@/lib/activity";
import {
  files,
  folders,
  getDb,
  googleAccounts,
  type Folder,
  type StoredFile,
} from "@/lib/db";
import { errorMessage, GatewayError } from "@/lib/errors";
import { adjustTypeUsage } from "@/lib/google/usage";
import { deleteFromBackend } from "@/lib/storage/backend";

export function sanitizeFolderName(value: string): string {
  const name = value
    .trim()
    .replace(/[\\/]/g, "")
    .slice(0, 120);

  if (!name) {
    throw new GatewayError(
      "bad_request",
      "Folder name is required",
      400,
    );
  }

  return name;
}

function getAllFolders(): Folder[] {
  return getDb().select().from(folders).all();
}

export function buildFolderPathMap(all: Folder[]): Map<string, string> {
  const byId = new Map(all.map((folder) => [folder.id, folder]));
  const paths = new Map<string, string>();

  const resolve = (id: string | null, depth = 0): string => {
    if (!id || depth > 100) {
      return "/";
    }

    const cached = paths.get(id);

    if (cached) {
      return cached;
    }

    const folder = byId.get(id);

    if (!folder) {
      return "/";
    }

    const parentPath = resolve(folder.parentId, depth + 1);
    const path =
      parentPath === "/"
        ? `/${folder.name}`
        : `${parentPath}/${folder.name}`;

    paths.set(id, path);
    return path;
  };

  for (const folder of all) {
    resolve(folder.id);
  }

  return paths;
}

export function getFolderPath(
  folderId: string | null | undefined,
): string {
  if (!folderId) {
    return "/";
  }

  return buildFolderPathMap(getAllFolders()).get(folderId) ?? "/";
}

export function getFolderById(id: string): Folder {
  const folder = getDb()
    .select()
    .from(folders)
    .where(eq(folders.id, id))
    .get();

  if (!folder) {
    throw new GatewayError("not_found", "Folder not found", 404);
  }

  return folder;
}

export function getBreadcrumbs(
  folderId: string | null | undefined,
): Array<{ id: string; name: string; path: string }> {
  if (!folderId) {
    return [];
  }

  const all = getAllFolders();
  const byId = new Map(all.map((folder) => [folder.id, folder]));
  const paths = buildFolderPathMap(all);
  const chain: Array<{ id: string; name: string; path: string }> = [];

  let current = byId.get(folderId);
  let depth = 0;

  while (current && depth < 100) {
    chain.unshift({
      id: current.id,
      name: current.name,
      path: paths.get(current.id) ?? "/",
    });
    current = current.parentId
      ? byId.get(current.parentId)
      : undefined;
    depth += 1;
  }

  return chain;
}

export function listFolders(options: {
  parentId?: string | null;
  status?: string;
  all?: boolean;
  bucketId?: string | null;
}) {
  const all = getAllFolders();
  const paths = buildFolderPathMap(all);
  const status = options.status ?? "active";
  const parentId = options.parentId ?? null;

  let result = all;

  if (options.bucketId) {
    result = result.filter(
      (folder) => folder.bucketId === options.bucketId,
    );
  }

  if (!options.all) {
    result = result.filter((folder) => folder.parentId === parentId);
  }

  if (status !== "all") {
    result = result.filter((folder) => folder.status === status);
  }

  return result
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((folder) => ({
      ...folder,
      path: paths.get(folder.id) ?? "/",
    }));
}

function assertActiveParent(parentId: string | null): void {
  if (!parentId) {
    return;
  }

  const parent = getFolderById(parentId);

  if (parent.status !== "active") {
    throw new GatewayError(
      "bad_request",
      "Parent folder is not active",
      400,
    );
  }
}

function assertUniqueName(
  name: string,
  parentId: string | null,
  bucketId: string,
  excludeId?: string,
): void {
  const siblings = getAllFolders().filter(
    (folder) =>
      folder.parentId === parentId &&
      folder.bucketId === bucketId &&
      folder.status === "active" &&
      folder.id !== excludeId,
  );

  if (
    siblings.some(
      (folder) => folder.name.toLowerCase() === name.toLowerCase(),
    )
  ) {
    throw new GatewayError(
      "duplicate_name",
      "A folder with that name already exists",
      409,
    );
  }
}

function collectSubtree(all: Folder[], rootId: string): Set<string> {
  const ids = new Set<string>([rootId]);
  let changed = true;

  while (changed) {
    changed = false;

    for (const folder of all) {
      if (
        folder.parentId &&
        ids.has(folder.parentId) &&
        !ids.has(folder.id)
      ) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }

  return ids;
}

function folderDepth(all: Folder[], id: string): number {
  const byId = new Map(all.map((folder) => [folder.id, folder]));
  let current = byId.get(id);
  let depth = 0;

  while (current?.parentId && depth < 100) {
    depth += 1;
    current = byId.get(current.parentId);
  }

  return depth;
}

function objectKeyFromPath(
  virtualPath: string,
  name: string,
): string {
  const prefix = virtualPath.replace(/^\/+|\/+$/g, "");

  return prefix ? `${prefix}/${name}` : name;
}

function refreshPathsForTree(rootId: string): void {
  const all = getAllFolders();
  const paths = buildFolderPathMap(all);
  const ids = collectSubtree(all, rootId);
  const db = getDb();

  for (const folderId of ids) {
    const folderPath = paths.get(folderId) ?? "/";
    const rows = db
      .select({ id: files.id, name: files.name })
      .from(files)
      .where(eq(files.folderId, folderId))
      .all();

    for (const row of rows) {
      db.update(files)
        .set({
          path: folderPath,
          key: objectKeyFromPath(folderPath, row.name),
        })
        .where(eq(files.id, row.id))
        .run();
    }
  }
}

async function deleteDriveFiles(items: StoredFile[]): Promise<void> {
  const db = getDb();
  const accounts = db.select().from(googleAccounts).all();
  const accountMap = new Map(accounts.map((account) => [account.id, account]));

  for (const file of items) {
    const account = accountMap.get(file.accountId);

    if (!account || account.status === "disconnected") {
      continue;
    }

    try {
      await deleteFromBackend(account, file.driveFileId);
    } catch (error) {
      const message = errorMessage(error);

      if (!/not found|404/i.test(message)) {
        recordActivity({
          action: "folder_delete_error",
          fileId: file.id,
          accountId: file.accountId,
          bytes: file.size,
          status: "error",
          message: message.slice(0, 500),
        });
        throw error;
      }
    }
  }
}

export function createFolder(input: {
  name: string;
  parentId?: string | null;
  bucketId?: string;
}) {
  const name = sanitizeFolderName(input.name);
  const parentId = input.parentId ?? null;
  let bucketId = input.bucketId ?? "default";

  if (parentId) {
    const parent = getFolderById(parentId);
    bucketId = parent.bucketId;
  }

  assertActiveParent(parentId);
  assertUniqueName(name, parentId, bucketId);

  const now = Date.now();
  const folder: Folder = {
    id: crypto.randomUUID(),
    name,
    parentId,
    bucketId,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };

  getDb().insert(folders).values(folder).run();

  return { ...folder, path: getFolderPath(folder.id) };
}

export function renameFolder(id: string, nameInput: string) {
  const folder = getFolderById(id);

  if (folder.status !== "active") {
    throw new GatewayError(
      "bad_request",
      "Cannot rename a folder that is not active",
      400,
    );
  }

  const name = sanitizeFolderName(nameInput);
  assertUniqueName(name, folder.parentId, folder.bucketId, id);

  const now = Date.now();

  getDb()
    .update(folders)
    .set({ name, updatedAt: now })
    .where(eq(folders.id, id))
    .run();

  refreshPathsForTree(id);

  return {
    ...folder,
    name,
    updatedAt: now,
    path: getFolderPath(id),
  };
}

export function moveFolder(id: string, parentId: string | null) {
  const folder = getFolderById(id);

  if (folder.status !== "active") {
    throw new GatewayError(
      "bad_request",
      "Cannot move a trashed folder",
      400,
    );
  }

  if (parentId === id) {
    throw new GatewayError(
      "bad_request",
      "A folder cannot be moved into itself",
      400,
    );
  }

  assertActiveParent(parentId);

  const all = getAllFolders();
  const subtree = collectSubtree(all, id);

  if (parentId && subtree.has(parentId)) {
    throw new GatewayError(
      "bad_request",
      "A folder cannot be moved into its own descendant",
      400,
    );
  }

  assertUniqueName(folder.name, parentId, id);

  const now = Date.now();

  getDb()
    .update(folders)
    .set({ parentId, updatedAt: now })
    .where(eq(folders.id, id))
    .run();

  refreshPathsForTree(id);

  return {
    ...folder,
    parentId,
    updatedAt: now,
    path: getFolderPath(id),
  };
}

export function moveFilesToFolder(
  ids: string[],
  folderId: string | null,
): number {
  if (ids.length === 0) {
    return 0;
  }

  if (folderId) {
    const folder = getFolderById(folderId);

    if (folder.status !== "active") {
      throw new GatewayError(
        "bad_request",
        "Target folder is not active",
        400,
      );
    }
  }

  const path = folderId ? getFolderPath(folderId) : "/";
  const now = Date.now();

  const result = getDb()
    .update(files)
    .set({ folderId, path, updatedAt: now })
    .where(and(inArray(files.id, ids), eq(files.status, "active")))
    .run();

  const rows = getDb()
    .select({ id: files.id, name: files.name })
    .from(files)
    .where(and(inArray(files.id, ids), eq(files.status, "active")))
    .all();

  for (const row of rows) {
    getDb()
      .update(files)
      .set({ key: objectKeyFromPath(path, row.name) })
      .where(eq(files.id, row.id))
      .run();
  }

  recordActivity({
    action: "move",
    status: "ok",
    message: `${result.changes} file(s) -> ${path}`,
  });

  return result.changes;
}

export async function deleteFolderPermanently(
  id: string,
): Promise<{ folders: number; files: number }> {
  const db = getDb();
  const folder = getFolderById(id);

  const all = getAllFolders();
  const subtree = collectSubtree(all, id);
  const folderIds = Array.from(subtree);
  const filesToDelete = db
    .select()
    .from(files)
    .all()
    .filter((file) => file.folderId && subtree.has(file.folderId));

  await deleteDriveFiles(filesToDelete);

  for (const file of filesToDelete) {
    if (file.status === "active") {
      adjustTypeUsage(
        file.accountId,
        file.mimeType,
        -file.size,
        -1,
      );
    }
  }

  if (filesToDelete.length > 0) {
    db.delete(files)
      .where(
        inArray(
          files.id,
          filesToDelete.map((file) => file.id),
        ),
      )
      .run();
  }

  const ordered = folderIds.sort(
    (a, b) => folderDepth(all, b) - folderDepth(all, a),
  );

  for (const folderId of ordered) {
    db.delete(folders).where(eq(folders.id, folderId)).run();
  }

  const totalBytes = filesToDelete.reduce(
    (sum, file) => sum + file.size,
    0,
  );

  recordActivity({
    action: "folder_delete",
    bytes: totalBytes,
    status: "ok",
    message: folder.name,
  });

  return { folders: folderIds.length, files: filesToDelete.length };
}


