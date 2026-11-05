# Google Drive Storage Gateway — Implementation Plan

## Tujuan

Bikin **storage gateway** berbasis Next.js yang menyimpan file ke beberapa akun Google Drive.
Gateway memilih akun **dengan sisa quota paling besar** (quota-aware, tie-break least-recently-used) saat upload,
menyediakan **REST API ber-API-key** (upload/list/download/delete/stats), dan **admin UI** untuk kelola akun, quota, file, dan API key.

Keputusan yang sudah dikonfirmasi:
- Bentuk: **API gateway + admin UI**
- Database: **SQLite + Drizzle**
- Pemilihan akun: **paling banyak sisa quota** (sediakan opsi `round_robin` lewat env)
- Auth admin: **single admin, tanpa auth dulu** (API key tetap wajib untuk endpoint publik)

---

## Prasyarat (harus disiapkan user sebelum/while implementasi)

1. **Google Cloud project**
   - Enable **Google Drive API**.
   - Buat **OAuth 2.0 Client ID** tipe *Web application*.
   - Authorized redirect URI: `http://localhost:3000/api/auth/google/callback` (dan URL production nanti).
   - Tambahkan akun-akun Google sebagai **Test users** (karena app masih mode Testing).
   - Scope yang dipakai (least privilege): `openid`, `email`, `profile`,
     `https://www.googleapis.com/auth/drive.file`,
     `https://www.googleapis.com/auth/drive.metadata.readonly`
     > `drive.file` cukup untuk file yang dibuat gateway; `drive.metadata.readonly` untuk baca `about.storageQuota`.
     > Kalau mau simpel, bisa ganti jadi `https://www.googleapis.com/auth/drive` (full), tapi lebih sensitif saat verifikasi.
2. **Env file** `.env.local` (lihat `.env.example` di bawah).

---

## Dependency baru

```bash
pnpm add googleapis drizzle-orm better-sqlite3 zod
pnpm add -D drizzle-kit @types/better-sqlite3
```

Catatan: `better-sqlite3` native. Next 16 sudah auto-externalize `better-sqlite3`, tapi tambahkan eksplisit.
Kalau native build gagal di Windows, fallback: `@libsql/client` + `drizzle-orm/libsql` (drop-in, file: URL).

### `.env.example`

```env
# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# App
APP_URL=http://localhost:3000

# SQLite (file path, relative to project root)
DATABASE_PATH=./data/gateway.db

# 32-byte base64 key untuk enkripsi refresh token
# generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
ENCRYPTION_KEY=

# Strategi pemilihan akun: quota | round_robin  (default quota)
ACCOUNT_SELECTION_STRATEGY=quota

# Batas upload multipart (byte). Raw-stream upload tidak dibatasi ini.
MAX_UPLOAD_BYTES=52428800
```

### `next.config.ts`

Tambahkan (tanpa menghapus config yang ada):

```ts
serverExternalPackages: ["googleapis", "google-auth-library", "better-sqlite3"],
```

### `.gitignore`

Tambahkan: `data/*.db`, `data/*.db-*`, `*.sqlite`.

`package.json` scripts:
```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:studio": "drizzle-kit studio"
```

---

## Struktur file yang dibuat/diubah

### Config & DB
- `drizzle.config.ts` — dialect sqlite, schema path, out `./lib/db/migrations`.
- `lib/db/schema.ts` — Drizzle schema (tabel di bawah).
- `lib/db/index.ts` — singleton `better-sqlite3` + drizzle; `pragma journal_mode=WAL`; pastikan folder `data/` ada; pakai `globalThis` guard untuk HMR dev.
- `lib/env.ts` — validasi env pakai zod (throw kalau `GOOGLE_*`/`ENCRYPTION_KEY` kosong).

### Core libs
- `lib/crypto.ts` — `encrypt(plain)` / `decrypt(cipher)` AES-256-GCM (`iv:tag:ciphertext` base64).
- `lib/google/oauth.ts` — `createOAuthClient()`, `buildAuthUrl(state)`, `exchangeCode(code)`, `fetchUserInfo(tokens)`.
- `lib/google/client.ts` — `getAuthorizedClient(account)`: decrypt refresh token, refresh access token kalau expiry < now+60s, persist token baru, return `{ oauth, drive: google.drive(...) }`.
- `lib/google/quota.ts` — `syncAccountQuota(account)`, `syncAllQuotas()`; `about.get({ fields: "storageQuota" })` → update `quota_limit/usage/usage_in_drive/last_quota_sync`.
- `lib/google/selection.ts` — `selectAccountForUpload(sizeBytes)`:
  - default `quota`: filter `status='active'` & `remaining >= size + safetyMargin`, pilih `remaining` terbesar; tie-break `last_used_at` paling lama.
  - `round_robin`: urut berdasarkan `last_used_at` paling lama (LRU = round robin natural).
  - return `null` kalau tidak ada yang muat.
- `lib/google/drive.ts` — wrapper Drive:
  - `uploadFromPath({ account, filePath, name, mimeType })` → `files.create` (media stream).
  - `downloadStream({ account, driveFileId, range? })` → `files.get({ fileId, alt: "media" }, { responseType: "stream", headers })`.
  - `removeFile(account, driveFileId)` → `files.delete`.
- `lib/files/service.ts` — orchestration:
  - `uploadFile({ streamOrBuffer, name, mimeType, path })`: sync quota → select account → upload → insert `files` row → log activity; kalau `storageQuotaExceeded`/`401`, refresh quota akun itu, tandai error, retry akun berikut (max 3).
  - `listFiles({ q, limit, cursor })`, `getFile(id)`, `softDeleteFile(id)`, `getGlobalStats()`.
- `lib/api/auth.ts` — `requireApiKey(req)`: baca `Authorization: Bearer` / `x-api-key`, sha256, lookup `api_keys` non-revoked, update `last_used_at`; throw 401.
- `lib/api/response.ts` — `jsonError(status, code, message)`, `withCors(res)`, `OPTIONS` helper.
- `lib/client-api.ts` — fetch helper untuk komponen admin (prefix `/api/admin`).

### DB schema (`lib/db/schema.ts`)

```
google_accounts
  id            text PK (uuid)
  email         text unique not null
  display_name  text
  picture_url   text
  refresh_token text not null          // encrypted
  access_token  text                   // encrypted (optional cache)
  token_expiry  integer                // epoch ms
  scope         text
  quota_limit         integer          // null = unlimited
  quota_usage         integer default 0
  quota_usage_in_drive integer default 0
  status        text default 'active'  // active | paused | error
  last_error    text
  last_used_at  integer
  last_quota_sync integer
  created_at    integer
  updated_at    integer

files
  id            text PK (uuid, ID publik untuk API)
  account_id    text FK -> google_accounts.id
  drive_file_id text not null
  name          text not null
  mime_type     text
  size          integer not null
  path          text default '/'      // virtual folder
  status        text default 'active' // active | trashed | error
  created_at    integer
  updated_at    integer

api_keys
  id          text PK
  name        text not null
  key_hash    text unique not null    // sha256(plaintext)
  key_prefix  text not null           // tampilkan e.g. "gwk_live_ab12"
  last_used_at integer
  revoked_at  integer
  created_at  integer

activity_log
  id          text PK
  action      text not null           // upload | download | delete | quota_sync
  file_id     text
  account_id  text
  api_key_id  text
  bytes       integer
  status      text default 'ok'       // ok | error
  message     text
  created_at  integer
```

Buat index: `files(account_id)`, `files(status)`, `api_keys(key_hash)`, `activity_log(created_at)`, `google_accounts(email)`.

---

## Route Handler surface

> Next 16: `params` adalah `Promise` → `{ params }: { params: Promise<{ id: string }> }`.
> `cacheComponents: true` melarang `export const runtime`; route handler sudah Node runtime.
> Jangan baca DB di Server Component yang di-prerender; halaman admin pakai client fetch ke route handler.

### OAuth
| Method | Path | Fungsi |
|---|---|---|
| GET | `/api/auth/google/start` | Generate `state`, set cookie httpOnly `g_oauth_state` (maxAge 600), redirect ke Google consent (`access_type=offline`, `prompt=consent`, scope di atas). |
| GET | `/api/auth/google/callback` | Validasi state, `exchangeCode`, `fetchUserInfo`, upsert `google_accounts` (email), encrypt refresh token, `syncAccountQuota`, redirect `/dashboard/accounts?connected=<email>`. |

### Public API v1 (wajib API key)
| Method | Path | Fungsi |
|---|---|---|
| POST | `/api/v1/upload` | Multipart (`file`, opsional `path`, `name`) **atau** raw body (`x-file-name`, `x-file-type`, opsional `x-file-path`). Pilih akun by quota, upload, insert row, return metadata. |
| GET | `/api/v1/files` | List file aktif; query `q`, `limit` (max 100), `offset`. |
| GET | `/api/v1/files/[id]` | Metadata file. |
| GET | `/api/v1/files/[id]/download` | Stream dari Drive. Forward `Range`; set `Content-Type`, `Content-Length`, `Content-Disposition: attachment; filename="..."`. |
| DELETE | `/api/v1/files/[id]` | Hapus di Drive + set `status='trashed'`. |
| GET | `/api/v1/stats` | Total file, total used/limit semua akun, per-akun ringkas. |
| OPTIONS | semua | CORS preflight (`Access-Control-Allow-*`). |

Contoh pakai:
```bash
curl -X POST http://localhost:3000/api/v1/upload \
  -H "Authorization: Bearer gwk_live_xxx" \
  -F "file=@./foto.jpg" -F "path=/foto"

curl -OJ http://localhost:3000/api/v1/files/<id>/download \
  -H "Authorization: Bearer gwk_live_xxx"
```

### Admin API (internal, belum di-auth — lihat catatan keamanan)
| Method | Path | Fungsi |
|---|---|---|
| GET | `/api/admin/overview` | Kartu ringkasan: total storage, used, free, jumlah akun, jumlah file, aktivitas terbaru. |
| GET | `/api/admin/accounts` | List akun + quota. |
| GET | `/api/admin/accounts/[id]/refresh` | Sync quota 1 akun. |
| POST | `/api/admin/accounts/sync` | Sync quota semua akun. |
| PATCH | `/api/admin/accounts/[id]` | `status: active|paused`. |
| DELETE | `/api/admin/accounts/[id]` | Disconnect akun (hapus token; file index jadi `error`/orphan). |
| GET | `/api/admin/files` | Semua file + filter status. |
| GET | `/api/admin/api-keys` | List key (tanpa plaintext). |
| POST | `/api/admin/api-keys` | Buat key; return plaintext **sekali**. |
| DELETE | `/api/admin/api-keys/[id]` | Revoke (`revoked_at`). |
| GET | `/api/admin/activity` | Log aktivitas terbaru. |

---

## Admin UI

Refactor layout dulu:
- **Baru** `app/dashboard/layout.tsx` → `SidebarProvider` + `AppSidebar` + `SidebarInset` + `SiteHeader`; `SidebarProvider` style `--sidebar-width`/`--header-height` dipindah ke sini.
- `app/dashboard/page.tsx` → overview (hapus import `data.json`, chart mock, dan `SidebarProvider` inline).
- Update `components/app-sidebar.tsx`: ganti `url: "#"` jadi route nyata:
  - All Files → `/dashboard/files`
  - Quota Tracker → `/dashboard/accounts`
  - Activity Log → `/dashboard/activity`
  - Api Keys → `/dashboard/api-keys`
  - Starred/Shared/Recycle Bin → `/dashboard/files?filter=...` (placeholder) atau sembunyikan dulu.

Halaman baru (semua **client component** yang fetch ke `/api/admin/*`, punya loading/error state):
- `app/dashboard/page.tsx` + `components/gateway/overview-cards.tsx` — Total Storage, Used, Free, Accounts, Files (ganti `SectionCards` mock). Chart opsional: bar per-akun usage.
- `app/dashboard/accounts/page.tsx` + `components/gateway/accounts-view.tsx` — tabel akun, progress bar quota, badge status, tombol **Connect Google Account** (`<a href="/api/auth/google/start">`), **Refresh quota**, **Pause/Resume**, **Disconnect** (pakai `components/ui/table`, `progress` tidak ada → pakai `div` bar, `badge`, `button`, `alert-dialog` bila perlu).
- `app/dashboard/files/page.tsx` + `components/gateway/files-view.tsx` — list file (reuse pola `components/data-table.tsx`/`@tanstack/react-table`), tombol **Upload** (dialog + `input type=file` → POST multipart ke admin proxy atau langsung v1? **pakai admin upload route** agar tidak butuh expose API key di browser), download, delete.
  - Tambah `POST /api/admin/upload` (sama seperti v1 tapi tanpa API key) untuk dipakai UI.
- `app/dashboard/api-keys/page.tsx` + `components/gateway/api-keys-view.tsx` — buat key (dialog menampilkan plaintext sekali + tombol copy), list prefix + last used, revoke.
- `app/dashboard/activity/page.tsx` + `components/gateway/activity-view.tsx` — tabel log.
- Wire tombol **Upload** di `components/nav-main.tsx` → link ke `/dashboard/files?upload=1` (buka dialog via query param).

Reuse yang sudah ada: `components/ui/{table,badge,button,card,select,dialog,alert-dialog,field,input,separator,skeleton,sonner}`. `sonner` sudah ada untuk toast.

---

## Next.js 16 / project gotchas (penting)

1. **`cacheComponents: true`** → jangan pakai `export const runtime`. Jangan baca SQLite/env dinamis di Server Component yang akan di-prerender (build akan gagal). Solusi: halaman admin = client component + route handler.
2. **`params` Promise**: `export async function GET(req, { params }: { params: Promise<{ id: string }> })` atau `RouteContext<'/api/v1/files/[id]'>`.
3. **Streaming**: Node `Readable.toWeb()` untuk download, `Readable.fromWeb(req.body)` untuk raw upload. `googleapis` butuh Node runtime (sudah default di project ini).
4. **Native module**: `better-sqlite3` wajib di `serverExternalPackages`.
5. Kode shadcn yang ada (`hooks/use-mobile.ts`, `components/chart-area-interactive.tsx`) sudah punya 2 lint error `react-hooks/set-state-in-effect`; perbaiki sekalian supaya `pnpm lint` bersih.

---

## Urutan implementasi

1. Install dependency + update `next.config.ts`, `.env.example`, `.gitignore`, scripts.
2. `lib/env.ts`, `lib/crypto.ts`, `drizzle.config.ts`, `lib/db/schema.ts`, `lib/db/index.ts`; `pnpm db:generate` + `pnpm db:migrate`.
3. `lib/google/{oauth,client,quota,selection,drive}.ts` + `lib/files/service.ts` + `lib/api/{auth,response}.ts`.
4. Route OAuth (`start`, `callback`); test connect 1 akun, cek row di DB + quota keisi.
5. Admin API (`accounts`, `overview`, `files`, `upload`, `api-keys`, `activity`).
6. Public API v1 (`upload`, `files`, `files/[id]`, `download`, `stats`, CORS).
7. Refactor dashboard layout + sidebar + halaman overview/accounts/files/api-keys/activity.
8. Fix 2 lint error lama, rapikan styling pakai token theme yang ada.
9. Update `README.md` dengan cara setup Google Console, env, dan contoh curl.

---

## Verifikasi

1. `pnpm db:generate && pnpm db:migrate` → cek `data/gateway.db` dan tabel ada.
2. `pnpm dev` → buka `/dashboard/accounts` → **Connect Google Account** dengan 2 akun test berbeda → keduanya muncul dengan quota.
3. Upload file kecil dari UI → muncul di `/dashboard/files`, cek file benar-benar ada di Google Drive akun terpilih.
4. Buat API key di `/dashboard/api-keys`, lalu:
   - `curl -H "Authorization: Bearer <key>" -F "file=@test.txt" localhost:3000/api/v1/upload`
   - `curl -H "Authorization: Bearer <key>" localhost:3000/api/v1/files`
   - `curl -OJ -H "Authorization: Bearer <key>" localhost:3000/api/v1/files/<id>/download`
   - `curl -X DELETE -H "Authorization: Bearer <key>" localhost:3000/api/v1/files/<id>`
   - Tanpa key → 401.
5. Verifikasi pemilihan akun: setelah 2 akun terhubung, upload beberapa file dan pastikan akun dengan sisa quota terbesar dipakai; kalau `ACCOUNT_SELECTION_STRATEGY=round_robin`, akun bergiliran.
6. `pnpm build` → harus sukses (tidak ada error prerender akibat `cacheComponents`).
7. `pnpm lint` → bersih.

---

## Catatan keamanan (MVP)

- Admin endpoint **belum di-auth** sesuai keputusan. Jangan expose ke publik sebelum menambah proteksi (session admin atau `ADMIN_TOKEN` header).
- Refresh/access token dienkripsi AES-256-GCM di DB; `ENCRYPTION_KEY` jangan di-commit.
- API key disimpan sebagai SHA-256 hash, plaintext hanya ditampilkan sekali.
- Batasi `MAX_UPLOAD_BYTES`, sanitasi nama file, dan validasi input pakai zod.
- Kalau nanti multi-user, tambahkan kolom `owner_id` di `api_keys`/`files` dan auth admin.

## Follow-up (di luar scope MVP)

- Upload resumable untuk file besar dari raw stream.
- Folder virtual penuh (tabel `folders`), sharing, trash restore.
- Rate limiting per API key, usage metering, dan enkripsi file sisi gateway.
