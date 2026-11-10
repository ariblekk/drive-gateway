# Changelog

All notable changes to this project will be documented in this file.

## [1.0.4] - 2026-11-11

### Added

- **Object Storage Dashboard**:
  - Renamed `/dashboard/files` ("All Files") to `/dashboard/object-storage` ("Object Storage"); updated sidebar, header title, trash redirect, and README.
  - Split the monolithic `files-view` into `components/gateway/object-storage/` subcomponents (metrics, settings, bucket/folder/delete dialogs, file detail sheet).
  - Tabbed view: **Objects**, **Metrics**, **Settings**.
  - Metrics tab shows **Average Storage**, **Data Retrieved**, and **Request Distribution** cards, a data-retrieved area chart, and a request-distribution bar chart, backed by `GET /api/admin/buckets/[id]/metrics` (30-day window from the activity log).
  - Settings tab shows bucket details (name, S3 API endpoint, created, storage account, objects, size) and a danger zone to delete the bucket.
- **Settings Tabs**: `/dashboard/settings` now splits into **General** (backup & restore) and **Credentials** (S3 credentials).
- **S3 Credential Management**: credentials can be edited via `PATCH /api/admin/s3-credentials/[id]`, with an edit/delete dropdown per row.
- Sidebar now shows the app version from `package.json`; the admin email is a static label (`admin@localhost`) so the dashboard stays prerenderable without runtime env.
- **Permanent Deletion (No Recycle Bin)**:
  - Dashboard, WebDAV, and S3 `DeleteObject` now permanently delete files/folders from the backing provider.
  - Removed the Recycle Bin navigation; the legacy `/dashboard/trash` URL redirects to Object Storage.
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
  - Multi-credential HTTP Basic Auth: Admin credentials (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) and S3 Access/Secret keys (with bucket-level isolation and read-only enforcement).
  - Native file explorer integration for Windows Explorer (Map Network Drive & PowerShell `net use`), macOS Finder, Cyberduck, and Rclone.
  - HTML directory browser view for standard web browsers.
  - Assert-based WebDAV test suite (`scripts/test-webdav.mjs`).
- S3 object overwrites now permanently remove the previous object instead of retaining it in an application recycle bin.

### Changed

- **Renamed to Omnibucket**: product name, page metadata, WebDAV realm/title, OpenAPI title, docs page, sidebar brand, overview label, package name (`omnibucket`), Docker image (`ariblekk/omnibucket`), container name (`omnibucket`), and volume (`omnibucket_data`). Backup format identifiers (`drive-gateway-backup`, `drive-gateway-credentials`) are unchanged so existing backups still restore.

- **S3 Credential Bucket Scope**: removed the `All (*)` option; every credential must target a single existing bucket (enforced in UI, API, service, and schema). Added migration `0011_require_s3_credential_bucket.sql`, disabling legacy wildcard credentials.
- **Settings Page**: backup & restore moved to the **General** tab; S3 credentials to the **Credentials** tab.
- Site header no longer shows the **Delete bucket** button; deleting a bucket lives in **Settings → Danger zone**.
- **Centralized Storage Backend Operations**:
  - Consolidated provider-specific upload, download, delete, checksum, and quota dispatching into `lib/storage/backend.ts`.
  - Updated file, folder, and quota services to call the shared dispatcher instead of branching between Google Drive and S3 at each call site.

- **Storage Metrics Consistency**:
  - Differentiated project-stored files (`totalFileBytes` / `indexedBytes`) from provider account capacity (`limitBytes`).
  - Synchronized Sidebar and Overview: "Storage used" reflects project-indexed data, while "Free space" continues to track aggregate provider remaining quota.
  - Updated Overview topology card description to: _"Live storage topology and last upload target."_

### Removed

- **API Keys**: removed the entire API keys feature (routes, dashboard page, components, backup schema, DB table `api_keys`, and `activity_log.api_key_id`) via migration `0010_remove_api_keys.sql`.
- Removed redundant _"Free Storage"_ row from sidebar breakdown.

### Fixed

- **S3 Endpoint Display**: the S3 API endpoint was read from `NEXT_PUBLIC_GATEWAY_URL`, which is inlined at build time and unavailable in the Docker build, so production rendered a bare `/s3`. The endpoint is now derived at runtime from `window.location.origin` (Object Storage → Settings, and Settings → Credentials). `NEXT_PUBLIC_GATEWAY_URL` is no longer used.
- **Sidebar Admin Email**: sidebar previously rendered the literal string `{process.env.NEXT_PUBLIC_ADMIN_EMAIL}`; it is now a plain hardcoded label.
- **SideRays Ref During Render**: moved the `settingsRef` assignment into a `useEffect` to satisfy `react-hooks/refs` (no ref writes during render).
- **S3 Credential Dialog**: corrected field labels and secret display/copy, and moved `AlertDialog` open-state props to the root.
- **Dark Mode for React Flow Controls**:
  - Overrode `.react-flow__controls` and `.react-flow__controls-button` using design token variables (`--card`, `--card-foreground`, `--border`, `--muted`), fixing the white button background in dark theme.
