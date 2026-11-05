import fs from "node:fs";
import type { Readable } from "node:stream";

import type { OAuth2Client } from "google-auth-library";

import { createDriveClient } from "./client";

export async function uploadFromPath(input: {
  auth: OAuth2Client;
  filePath: string;
  name: string;
  mimeType: string;
}): Promise<{
  id?: string | null;
  name?: string | null;
  mimeType?: string | null;
  size?: string | null;
  md5Checksum?: string | null;
  sha256Checksum?: string | null;
  modifiedTime?: string | null;
}> {
  const drive = createDriveClient(input.auth);

  const response = await drive.files.create({
    requestBody: { name: input.name },
    media: {
      mimeType: input.mimeType,
      body: fs.createReadStream(input.filePath),
    },
    fields:
      "id,name,mimeType,size,md5Checksum,sha256Checksum,modifiedTime",
  });

  return response.data;
}

export async function getFileChecksum(input: {
  auth: OAuth2Client;
  driveFileId: string;
}): Promise<{
  md5Checksum?: string | null;
  sha256Checksum?: string | null;
}> {
  const drive = createDriveClient(input.auth);

  const response = await drive.files.get({
    fileId: input.driveFileId,
    fields: "id,md5Checksum,sha256Checksum",
  });

  return response.data;
}

export async function downloadFileStream(input: {
  auth: OAuth2Client;
  driveFileId: string;
  range?: string | null;
}) {
  const drive = createDriveClient(input.auth);

  return drive.files.get(
    { fileId: input.driveFileId, alt: "media" },
    {
      responseType: "stream",
      headers: input.range ? { Range: input.range } : undefined,
    },
  );
}

export async function trashFile(input: {
  auth: OAuth2Client;
  driveFileId: string;
}): Promise<void> {
  const drive = createDriveClient(input.auth);
  await drive.files.update({
    fileId: input.driveFileId,
    requestBody: { trashed: true },
    fields: "id,trashed",
  });
}

export async function restoreFile(input: {
  auth: OAuth2Client;
  driveFileId: string;
}): Promise<void> {
  const drive = createDriveClient(input.auth);
  await drive.files.update({
    fileId: input.driveFileId,
    requestBody: { trashed: false },
    fields: "id,trashed",
  });
}

export async function removeFile(input: {
  auth: OAuth2Client;
  driveFileId: string;
}): Promise<void> {
  const drive = createDriveClient(input.auth);
  await drive.files.delete({ fileId: input.driveFileId });
}

export type DriveStream = Readable;
