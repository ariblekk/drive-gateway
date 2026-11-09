# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2026-11-08

### Added

- **Permanent Deletion (No Recycle Bin)**:
  - Dashboard, WebDAV, public REST API, and S3 `DeleteObject` now permanently delete files/folders from the backing provider.
  - Removed the Recycle Bin navigation; the legacy `/dashboard/trash` URL redirects to All Files.
  - Updated API documentation and README to warn that deletion cannot be undone.
- **Interactive Storage Topology (React Flow)**:
  - Visual diagram on Overview representing the central project hub connected to storage providers (Google Drive and S3).
  - 4-cardinal directional handles (`top`, `right`, `bottom`, `left`) with smooth bezier curves.
  - Active upload highlight showing real-time pulse indicator and animated edge pointing to the most recently used account (`lastUsedAt`).
  - Pan-on-drag, trackpad pinch, and `Ctrl + scroll` zoom controls with reset button.
  - Display unique account email instead of display name to avoid ambiguity.
- **Specific Storage Account Binding for S3 Buckets**:
  - Added `storage_account_id` foreign key column to the `buckets` table with migration (`0009_spotty_talon.sql`).
  - Added option _"Use specific storage account"_ in the Create Bucket dialog, featuring a selector showing provider icons (Google Drive / S3) and account email.
  - Automatic upload routing enforcement (`uploadTempFile`): uploads targeting a bucket bound to a specific account route directly to that account.
  - Backup & restore support for bucket storage account binding (`lib/backup.ts`).
- **Target Account in Recent Activity**:
  - Added `Target` column in the Recent Activity table on the Overview dashboard displaying the target account email (`accountEmail`).
  - Extended `/api/admin/overview` response to map `accountId` to account email for activity log entries.
- **WebDAV Endpoint (`/webdav`)**:
  - Full RFC 4918 WebDAV server implementation supporting `OPTIONS`, `PROPFIND`, `GET`, `HEAD`, `PUT`, `DELETE`, `MKCOL`, `MOVE`, `COPY`, `LOCK`, `UNLOCK`, and `PROPPATCH`.
  - Next.js Pages API routing bypass (`pages/api/webdav/[[...path]].ts` rewritten from `/webdav`) to support non-standard WebDAV HTTP methods prohibited by App Router.
  - Streaming upload handler with disabled Next.js body parser (`bodyParser: false`) for raw payload transfers.
  - Multi-credential HTTP Basic Auth: Admin credentials (`ADMIN_EMAIL`/`ADMIN_PASSWORD`), S3 Access/Secret keys (with bucket-level isolation and read-only enforcement), and API Keys (`gwk_live_...`).
  - Native file explorer integration for Windows Explorer (Map Network Drive & PowerShell `net use`), macOS Finder, Cyberduck, and Rclone.
  - HTML directory browser view for standard web browsers.
  - Assert-based WebDAV test suite (`scripts/test-webdav.mjs`).
- S3 object overwrites now permanently remove the previous object instead of retaining it in an application recycle bin.

### Changed

- **Centralized Storage Backend Operations**:
  - Consolidated provider-specific upload, download, delete, checksum, and quota dispatching into `lib/storage/backend.ts`.
  - Updated file, folder, and quota services to call the shared dispatcher instead of branching between Google Drive and S3 at each call site.

- **Storage Metrics Consistency**:
  - Differentiated project-stored files (`totalFileBytes` / `indexedBytes`) from provider account capacity (`limitBytes`).
  - Synchronized Sidebar and Overview: "Storage used" reflects project-indexed data, while "Free space" continues to track aggregate provider remaining quota.
  - Updated Overview topology card description to: _"Live storage topology and last upload target."_

### Removed

- Removed redundant _"Free Storage"_ row from sidebar breakdown.

### Fixed

- **Dark Mode for React Flow Controls**:
  - Overrode `.react-flow__controls` and `.react-flow__controls-button` using design token variables (`--card`, `--card-foreground`, `--border`, `--muted`), fixing the white button background in dark theme.
