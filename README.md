# Drive Gateway

A multi-provider **storage gateway** (Google Drive & S3 backends) with an admin dashboard and an S3-compatible REST API.

Uploads are routed automatically to the connected storage account with the **most free space** (ties go to the least recently used account), or round-robin if configured.

## Features

- Connect multiple **Google Drive** accounts via OAuth 2.0.
- Connect external **S3 storage backends** (Cloudflare R2, MinIO, Wasabi, Backblaze B2, AWS S3) with customizable quota limits.
- Automatic account selection across all providers based on remaining quota (`quota` or `round_robin`).
- S3-compatible API endpoint (`/s3`) with AWS Signature V4 authentication, bucket isolation, and storage limits.
- Admin dashboard: overview with bandwidth charts, accounts & quota, file manager with bucket selector, recycle bin, API keys & S3 credentials, activity log.
- File manager: folders, breadcrumb navigation, search, pagination, checkbox bulk actions (files and folders), rename, move, trash, restore, and permanent delete.
- Upload dialog with drag & drop, multiple files, per-file progress, bucket selection, and folder destination.
- Server-side upload limit from `MAX_UPLOAD_BYTES`; the limit is shown in the UI.
- Public REST API: upload, list, metadata, download with `Range`, delete, and stats.
- Recycle bin backed by Google Drive trash and virtual trash for S3 backends.
- Sidebar storage breakdown: photos, videos, documents, free space, and used space.
- Sonner toasts, confirmation dialogs, and responsive header actions (icon-only on mobile).
- SQLite + Drizzle ORM, Docker support with a persistent volume.
- Secrets and refresh tokens encrypted with AES-256-GCM; API keys stored as SHA-256 hashes.

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
| `ADMIN_PASSWORD` | Yes | Admin login password. Set it directly in the deployment environment; never commit it to source control. |
| `GOOGLE_CLIENT_ID` | Yes | OAuth client ID. |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth client secret. |
| `GOOGLE_REDIRECT_URI` | Yes | Must exactly match the Google Console redirect URI. |
| `APP_URL` | No | Public app URL. Defaults to `http://localhost:3000`. |
| `COOKIE_SECURE` | No | `1` forces the `Secure` session cookie, `0` disables it, unset derives it from `APP_URL`. |
| `STORAGE_DIR` | No | Data directory. Defaults to `./data`; Docker uses `/data`. |
| `DATABASE_PATH` | No | SQLite path. Defaults to `$STORAGE_DIR/gateway.db`. |
| `ENCRYPTION_KEY` | Yes | 32-byte base64 key for refresh-token encryption and session signing. |
| `ACCOUNT_SELECTION_STRATEGY` | No | `quota` (default) or `round_robin`. |
| `MAX_UPLOAD_BYTES` | No | Max upload per request. Defaults to 50 MB if unset; `.env.example` uses 500 MB. |
| `S3_REGION` | No | S3 region string. Defaults to `us-east-1`. |
| `S3_MAX_PUT_BYTES` | No | Maximum object size for single S3 PutObject (bytes). Defaults to 1 GB. |
| `TRUST_PROXY` | No | `1` to trust `X-Forwarded-For` / `X-Real-IP` for login rate limiting. Enable only behind a reverse proxy that overwrites those headers. Defaults to `0`. |
| `LOGIN_MAX_PER_IP` | No | Failed logins allowed per IP per window. Defaults to `5`. |
| `LOGIN_MAX_PER_EMAIL` | No | Failed logins allowed per email per window. Defaults to `20`. |
| `LOGIN_WINDOW_MINUTES` | No | Login, backup, restore, and API-key rate-limit window in minutes. Defaults to `1`. |
| `ADMIN_PASSWORD_MAX_ATTEMPTS` | No | Failed admin-password checks (backup/restore) per IP per window. Defaults to `5`. |
| `API_KEY_MAX_FAILURES` | No | Invalid API-key attempts per IP per window. Defaults to `30`. |
| `S3_ALLOW_PRIVATE_ENDPOINTS` | No | `1` allows S3 backend endpoints on private networks (e.g. MinIO on a LAN). Link-local and metadata addresses stay blocked. Defaults to `0`. |

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
- Database migrations run automatically on container start. The container fixes `/data` ownership before migrations, then runs the app as the unprivileged `gateway` user.
- `docker compose down` keeps the volume. Do **not** use `docker compose down -v` unless you want to delete the data.

## Usage

1. Log in at `/login`.
2. Go to `/dashboard/accounts` and click **Connect account**. Repeat for each Google account.
3. Upload from `/dashboard/files` or the sidebar. Files are routed by available quota.
4. Manage folders and files with checkboxes, bulk actions, or the 3-dot row menu.
5. Deleted items go to `/dashboard/trash`, where they can be restored or permanently deleted.
6. Create API keys at `/dashboard/api-keys`. A key is shown only once.

## API

Interactive API documentation (Swagger UI) is available at:
- **Swagger Docs:** `http://localhost:3000/docs` (or `https://your-domain/docs`)
- **OpenAPI 3.0 JSON:** `http://localhost:3000/api/openapi.json`

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

## S3-Compatible API

Drive Gateway provides an S3-compatible API at `/s3`. It supports standard AWS Signature V4 authentication using access key ID and secret access key.

### Configuration for S3 Clients

- **Endpoint:** `http://<host>:3000/s3` (or `https://your-domain/s3`)
- **Region:** `us-east-1` (or whatever `S3_REGION` is set to)
- **Path-style:** Required (`force_path_style = true`)
- **Credentials:** Create at `/dashboard/api-keys` under the **S3 credentials** card.

### Credential Isolation & Quota

When creating S3 credentials in the dashboard, you can configure:
- **Bucket Scope:** Restrict the credential to a single bucket (e.g. `blog`), or allow access to `All buckets (*)`. An isolated credential cannot see or access other buckets (`ListBuckets` only returns its assigned bucket; requests to other buckets return `403 AccessDenied`).
- **Permissions:** Choose `Read & Write` or `Read Only`. Read-only credentials reject `PUT` and `DELETE` requests with `403 AccessDenied`.
- **Storage Limit:** Set a maximum storage capacity (e.g. `10 GB` or `500 MB`). Uploads exceeding the limit are blocked with `403 QuotaExceeded`. The dashboard shows live usage against the quota (`Used / Max`).

### Supported S3 Operations

- `ListBuckets`
- `HeadBucket`
- `CreateBucket`
- `DeleteBucket` (empty buckets only)
- `GetBucketLocation`
- `ListObjectsV2` (prefix, delimiter, continuation token)
- `PutObject` (single request up to `S3_MAX_PUT_BYTES`, ETag MD5, metadata)
- `GetObject` (streaming, Range requests)
- `HeadObject` (metadata, ETag, Content-Type)
- `DeleteObject` (moves file to Google Drive trash)

### S3 Client Examples

#### rclone

Configure `~/.config/rclone/rclone.conf`:

```ini
[drive-gw]
type = s3
provider = Other
endpoint = https://your-domain/s3
access_key_id = s3_your_access_key
secret_access_key = your_secret_key
region = us-east-1
force_path_style = true
```

Commands:

```bash
rclone lsd drive-gw:
rclone copy ./my-file.zip drive-gw:default/backups/
rclone ls drive-gw:default/backups/
```

#### AWS CLI

```bash
export AWS_ACCESS_KEY_ID="s3_your_access_key"
export AWS_SECRET_ACCESS_KEY="your_secret_key"
export AWS_DEFAULT_REGION="us-east-1"
ENDPOINT="http://localhost:3000/s3"

# List buckets
aws --endpoint-url $ENDPOINT s3api list-buckets

# Upload an object
aws --endpoint-url $ENDPOINT s3api put-object \
  --bucket default --key photos/sunset.jpg --body ./sunset.jpg

# List objects with prefix
aws --endpoint-url $ENDPOINT s3api list-objects-v2 \
  --bucket default --prefix photos/

# Download object
aws --endpoint-url $ENDPOINT s3api get-object \
  --bucket default --key photos/sunset.jpg ./downloaded.jpg

# Delete object
aws --endpoint-url $ENDPOINT s3api delete-object \
  --bucket default --key photos/sunset.jpg
```

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

- `/dashboard` and `/api/admin/*` require the admin session; `/docs` and `/api/openapi.json` are protected too.
- `/api/v1/*` uses API keys, never the admin session. API keys are global admin bridges and are not bucket-scoped by design.
- S3 credentials are bucket-scoped. An empty bucket is rejected; wildcard access requires an explicit opt-in.
- `ADMIN_PASSWORD` is compared in constant time; set a strong password and keep it only in the deployment environment.
- Login, backup, restore, and invalid API-key attempts are rate limited per IP and persisted in SQLite. Successful checks clear the counter.
- Logging out bumps a session epoch, revoking every outstanding session token (including stolen cookies).
- Responses include `nosniff`, framing protection, a restrictive CSP, and a global `Content-Security-Policy` for the app. S3 objects are served with a sandbox CSP and safe `Content-Disposition`; only safe MIME types render inline.
- CORS headers are applied only to the public `/api/v1/*` endpoints, never to cookie-authenticated admin routes.
- S3 backend endpoints are checked against SSRF: loopback, link-local, metadata hosts, and private ranges are blocked unless `S3_ALLOW_PRIVATE_ENDPOINTS=1`.
- S3 uploads must sign a payload hash; `UNSIGNED-PAYLOAD` is rejected for write operations.
- Refresh tokens and S3 secrets are encrypted with AES-256-GCM; API keys are stored as SHA-256 hashes.
- `MAX_UPLOAD_BYTES` is enforced on the server before the body is processed.
- Changing `ENCRYPTION_KEY` invalidates existing sessions and stored refresh tokens.
- Use HTTPS in production and bind the container to loopback behind a TLS reverse proxy.

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
