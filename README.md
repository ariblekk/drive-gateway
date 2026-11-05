# Drive Gateway

A multi-account **Google Drive storage gateway** with an admin dashboard and an API-key REST API.

Uploads are routed automatically to the connected Google account with the **most free space** (ties go to the least recently used account), or round-robin if configured.

## Features

- Connect multiple Google Drive accounts via OAuth 2.0.
- Automatic account selection by remaining quota, with `quota` or `round_robin` strategies.
- Admin dashboard: overview, accounts and quota, file manager, recycle bin, API keys, activity log.
- File manager: folders, breadcrumb navigation, search, pagination, checkbox bulk actions (files and folders), rename, move, trash, restore, and permanent delete.
- Upload dialog with drag & drop, multiple files, per-file progress, and folder destination.
- Server-side upload limit from `MAX_UPLOAD_BYTES`; the limit is shown in the UI.
- Public REST API: upload, list, metadata, download with `Range`, delete, and stats.
- Recycle bin backed by Google Drive trash.
- Sidebar storage breakdown: photos, videos, documents, free space, and used space.
- Sonner toasts, confirmation dialogs, and responsive header actions (icon-only on mobile).
- SQLite + Drizzle ORM, Docker support with a persistent volume.
- Refresh tokens encrypted with AES-256-GCM; API keys stored as SHA-256 hashes.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · Drizzle ORM + SQLite · googleapis · Sonner

## Requirements

- Node.js 20+ (Docker uses Node 24)
- pnpm 12.9.1 (`corepack enable`)
- A Google Cloud project with Google Drive API and an OAuth 2.0 Web Client
- Docker + Docker Compose (optional)

## Quick Start

```bash
pnpm install
cp .env.example .env
# fill in the environment variables
pnpm db:migrate
pnpm dev
```

Open:

- `http://localhost:3000/login` — admin login
- `http://localhost:3000/dashboard` — admin dashboard

There is no signup page. Admin credentials come only from `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

## Google OAuth Setup

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable **Google Drive API**.
3. Configure the OAuth consent screen. While the app is in **Testing**, add every Google account you want to use as a **Test user**.
4. Create an **OAuth 2.0 Client ID** of type **Web application**.
5. Add the exact redirect URI:
   - `http://localhost:3000/api/auth/google/callback`
   - `https://your-domain/api/auth/google/callback`

Scopes:

```text
openid
email
profile
https://www.googleapis.com/auth/drive.file
https://www.googleapis.com/auth/drive.metadata.readonly
```

`drive.file` only grants access to files created by the gateway. For full Drive access, replace the Drive scopes with `https://www.googleapis.com/auth/drive`.

## Environment

| Variable | Required | Description |
| --- | --- | --- |
| `ADMIN_EMAIL` | Yes | Admin login email. |
| `ADMIN_PASSWORD` | Yes | Admin login password. Change before deploying. |
| `GOOGLE_CLIENT_ID` | Yes | OAuth client ID. |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth client secret. |
| `GOOGLE_REDIRECT_URI` | Yes | Must exactly match the Google Console redirect URI. |
| `APP_URL` | No | Public app URL. Defaults to `http://localhost:3000`. |
| `STORAGE_DIR` | No | Data directory. Defaults to `./data`; Docker uses `/data`. |
| `DATABASE_PATH` | No | SQLite path. Defaults to `$STORAGE_DIR/gateway.db`. |
| `ENCRYPTION_KEY` | Yes | 32-byte base64 key for refresh-token encryption and session signing. |
| `ACCOUNT_SELECTION_STRATEGY` | No | `quota` (default) or `round_robin`. |
| `MAX_UPLOAD_BYTES` | No | Max upload per request. Defaults to 50 MB if unset; `.env.example` uses 500 MB. |

Generate `ENCRYPTION_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Never commit `.env`, `data/`, or `*.db`; they are gitignored.

## Running

### Development

```bash
pnpm dev
```

### Production (without Docker)

```bash
pnpm build
pnpm start
```

Set `APP_URL` and `GOOGLE_REDIRECT_URI` to the production domain and use HTTPS.

### Docker

```bash
docker compose up -d --build
docker compose logs -f gateway
```

- Port: `3000`
- Volume: `drive_gateway_data` mounted at `/data`
- Database migrations run automatically on container start.
- `docker compose down` keeps the volume. Do **not** use `docker compose down -v` unless you want to delete the data.

## Usage

1. Log in at `/login`.
2. Go to `/dashboard/accounts` and click **Connect account**. Repeat for each Google account.
3. Upload from `/dashboard/files` or the sidebar. Files are routed by available quota.
4. Manage folders and files with checkboxes, bulk actions, or the 3-dot row menu.
5. Deleted items go to `/dashboard/trash`, where they can be restored or permanently deleted.
6. Create API keys at `/dashboard/api-keys`. A key is shown only once.

## API

Authenticate with either header:

```http
Authorization: Bearer <api-key>
```

```http
x-api-key: <api-key>
```

Example:

```bash
KEY="gwk_live_xxx"
BASE="http://localhost:3000"

# Upload (multipart)
curl -X POST "$BASE/api/v1/upload" \
  -H "Authorization: Bearer $KEY" \
  -F "file=@./photo.jpg" \
  -F "path=/photos"

# List files
curl -H "Authorization: Bearer $KEY" \
  "$BASE/api/v1/files?q=photo&limit=20&offset=0"

# Download
curl -OJ -H "Authorization: Bearer $KEY" \
  "$BASE/api/v1/files/<file-id>/download"

# Delete (moves to Google Drive trash)
curl -X DELETE -H "Authorization: Bearer $KEY" \
  "$BASE/api/v1/files/<file-id>"

# Stats
curl -H "Authorization: Bearer $KEY" \
  "$BASE/api/v1/stats"
```

### Public Endpoints

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/v1/upload` | Multipart (`file`, `folderId`, `path`, `name`) or raw body with `x-file-name`, `x-file-type`, `x-file-path`, `x-folder-id`. |
| GET | `/api/v1/files` | List files (`q`, `folderId`, `limit`, `offset`). |
| GET | `/api/v1/files/:id` | File metadata. |
| GET | `/api/v1/files/:id/download` | Stream file; supports `Range`. |
| DELETE | `/api/v1/files/:id` | Move to Google Drive trash. |
| GET | `/api/v1/stats` | Storage and file statistics. |

The admin dashboard uses `/api/admin/*` with the admin session cookie. It is not accessible with API keys.

## Notes & Limitations

- **Folders are virtual** — stored as SQLite metadata, not physical folders in Google Drive.
- **Single admin** — no multi-user accounts or roles.
- **SQLite** — suitable for personal/small deployments; not horizontally scalable.
- **Single-request upload** — no chunked or resumable upload.
- **Cloudflare** — uploads are still capped at 100 MB per request on Free/Pro plans. `MAX_UPLOAD_BYTES` cannot bypass Cloudflare; use a DNS-only hostname or LAN access for larger files.
- **OAuth Testing mode** — refresh tokens can expire after 7 days. Publish the OAuth app for long-term use.
- **Quota totals** include Gmail and Photos, so the gateway file breakdown can be smaller than the account's used space.
- **Disconnect is soft** — tokens are removed, but indexed files remain in Google Drive.

## Security

- `/dashboard` and `/api/admin/*` require the admin session.
- `/api/v1/*` uses API keys, never the admin session.
- Refresh tokens are encrypted with AES-256-GCM; API keys are hashed with SHA-256.
- `MAX_UPLOAD_BYTES` is enforced on the server before the body is processed.
- Changing `ENCRYPTION_KEY` invalidates existing sessions and stored refresh tokens.
- Use HTTPS in production and change the default admin password.

## Project Structure

```text
app/api/            auth, public v1, admin, and upload routes
app/dashboard/      admin pages (overview, accounts, files, trash, activity, api-keys)
components/gateway/ admin UI components
components/ui/      shadcn/ui components
lib/db/             Drizzle schema, connection, migrations
lib/files/          file services (upload, list, trash, storage summary)
lib/folders/        virtual folder services
lib/google/         OAuth, Drive client, quota, account selection
data/               SQLite database and temp uploads (gitignored)
proxy.ts            Next.js 16 auth/redirect middleware
scripts/migrate.mjs automatic migrations for Docker
```

## Scripts

```bash
pnpm dev           # development
pnpm build         # production build
pnpm start         # run production build
pnpm lint          # ESLint
pnpm db:migrate    # apply migrations
pnpm db:generate   # generate a migration after schema changes
pnpm db:studio     # Drizzle Studio
```
