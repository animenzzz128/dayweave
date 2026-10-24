# Private instance (#55, DW-1014)

A hosted copy of the server for the owner only. The local `127.0.0.1:8767` app is unchanged and stays the fallback.

## How hosted mode works

Hosted mode turns on only when `DAYWEAVE_PUBLIC_ORIGIN` is set (`scripts/serve.cjs`). Startup then fails unless every required variable is present, so a half-configured deploy never starts open. The supervising launcher always builds the local app.

| Variable | Where it lives | Purpose |
| --- | --- | --- |
| `DAYWEAVE_PUBLIC_ORIGIN` | `fly.toml` `[env]` | Bare `https://` origin. Requests with any other `Host` are refused (403). |
| `DAYWEAVE_GOOGLE_CLIENT_ID`, `DAYWEAVE_GOOGLE_CLIENT_SECRET` | Fly secrets | Google OAuth web client used for sign-in only (`openid email` scopes). |
| `DAYWEAVE_ALLOWED_EMAIL` | Fly secrets | The one account allowed in. Matched case-insensitively and must be Google-verified. |
| `DAYWEAVE_SESSION_SECRET` | Fly secrets | At least 32 random characters (a constant value such as all "A"s is refused); signs the session and login cookies. Rotating it signs everyone out. |
| `DAYWEAVE_INGEST_SECRET` | Fly secrets (optional) | At least 32 random characters; enables `/api/ingest`. Unset means ingest always returns 401. |
| `DAYWEAVE_CANVAS_ICS_URL` | Fly secrets (optional) | Canvas calendar feed link (https). The server reads it for the cloud collector; it never appears in responses or errors. |
| `DAYWEAVE_DATA_DIR`, `PORT` | `fly.toml` `[env]` | `/data` (the volume) and `8080`. |
| `DAYWEAVE_WEB_DIST` | Docker image | The built `web/` front end (server mode). Set by the image; unset serves the classic UI at `/`. |

- **Interface.** The image builds the `web/` front end (the same pages as the public demo) in server mode and serves it at `/`; it reads and writes this server's API like the classic UI. The banner says it is the private instance and has **Classic view** (`/classic` → `/home`, the classic UI, kept for two weeks as a fallback) and **Sign out**. Its CSP allows the page's one inline theme script by hash; the shared rule files are wrapped at build time, so no `unsafe-eval` is needed. Data health has Backups (create, export, restore with a confirmation; an empty database still needs Classic view). Not yet in the new front end: effort confirmation and weekly trends (use Classic view); its AI briefs show Dayweave's rule-based fallback.
- **Sign-in.** `/auth/login` redirects to Google with a random `state` and `nonce` held in a signed, 10-minute `__Host-dwlogin` cookie. `/auth/callback` exchanges the code with Google's token endpoint and accepts the ID token only if issuer, audience (this client), expiry, nonce, `email_verified` and the allowlisted email all match. There is no sign-up and no second account.
- **Session.** A signed, stateless `__Host-dw` cookie (`HttpOnly; Secure; SameSite=Lax; Path=/`, 12 hours), so machine restarts and auto-stop do not sign the owner out. It carries the CSRF token returned by `/api/session`. Writes still need that token plus an exact `Origin`. Sign out is a form in the sidebar (`POST /auth/logout`, origin-checked) that lands on `/auth/signed-out`, a same-origin page with a sign-in link; the CSP `form-action 'self'` would block redirecting the form straight to Google. An expired session sends the browser to `/auth/login` on its next API call.
- **Unauthenticated requests.** Pages redirect to `/auth/login`; API routes return 401; every other method is 405.
- **Cross-site requests.** Top-level GET page navigations from other sites are allowed, because Google's sign-in returns to `/auth/callback` cross-site. Every other cross-site request (API calls, posts, embedded loads) is refused with 403.
- **Rate limits** (per `Fly-Client-IP`, in memory, reset on restart): 600 requests/minute overall, 30 sign-in requests per 10 minutes, 20 ingest calls per hour.
- **Headers.** HSTS, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, a restrictive `Permissions-Policy`, and the existing CSP, `nosniff` and `no-store`. `same-origin` (not `no-referrer`) is deliberate: with `no-referrer` browsers send `Origin: null` on form posts, which would break the origin check.

## Ingest API

```
POST /api/ingest
Authorization: Bearer <DAYWEAVE_INGEST_SECRET>
Content-Type: application/json

<snapshot per docs/data-contract.md, at most 5 MB>
```

`GET /api/ingest` with the same header returns `{snapshot, canvas}`: the current snapshot and the Canvas feed read on the server (`status` `ok`, `failed` or `unconfigured`). `POST /api/ingest?dryRun=1` validates and merges without writing and reports `archived`, the assignment IDs the import would mark as removed from their source.

The body goes through the same `Store.importSnapshot` as a local refresh: validation, merge, archive rules, a retained source snapshot and the daily backup. An invalid snapshot returns 400 and keeps the previous records. A success returns `{ok, generatedAt, assignments, events, archived}`. No browser session is involved and the secret is compared in constant time. The cloud collector that calls this is [cloud-collection.md](cloud-collection.md) (#56).

## Deploying to Fly.io (needs the owner's approval)

Nothing below has been run. Each step uses the owner's Fly.io and Google accounts.

1. **Google OAuth client.** In Google Cloud Console → APIs & Services → Credentials, create an OAuth client ID of type *Web application*. Authorized redirect URI: `https://<app>.fly.dev/auth/callback`. The consent screen can stay in *Testing* with the owner as the only test user.
2. **App and volume.** Copy `deploy/fly.toml.example` outside the repository, set the app name and origin, then:
   ```
   fly apps create <app>
   fly volumes create dayweave_data --app <app> --region iad --size 1
   ```
   Fly volumes are encrypted at rest by default; keep it that way.
3. **Secrets** (generate the two random ones with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`):
   ```
   fly secrets set --app <app> DAYWEAVE_GOOGLE_CLIENT_ID=... DAYWEAVE_GOOGLE_CLIENT_SECRET=... \
     DAYWEAVE_ALLOWED_EMAIL=... DAYWEAVE_SESSION_SECRET=... DAYWEAVE_INGEST_SECRET=...
   ```
4. **Deploy** from a clean checkout of the accepted revision: `fly deploy --config <private fly.toml> --dockerfile Dockerfile`. One machine only; SQLite needs a single writer.
5. **Check.** Open the origin in a private window: it must redirect to Google, accept the owner and refuse any other account. Without a cookie, `/api/snapshot` must return 401.

The image contains only `package.json`, `src/` and `scripts/` (see `.dockerignore`). It runs as the unprivileged `node` user after handing `/data` to it.

## Backups

- **In the app:** every import makes at most one backup per day in `/data/backups` and keeps 30 days (`Store.dailyBackup`). Settings → Backups can create and restore them.
- **Volume snapshots:** Fly snapshots the volume daily; `snapshot_retention = 14` in the template keeps two weeks. Restore with `fly volumes create --snapshot-id ...`.
- **Off-site copy (optional):** `fly ssh sftp get /data/backups/<name> <local folder>` copies a backup to the owner's machine. Both copies above live with the same provider, so do this before risky changes.

## Importing the private database (needs separate approval)

This uses the existing backup/restore path and never touches the local original.

1. On the owner's machine, take a consistent copy without stopping the local app: either copy the newest file in the local data folder's `backups/`, or run `node scripts/db.cjs backup` with `DAYWEAVE_DATA_DIR` pointing at the private data (it writes a new backup with `VACUUM INTO`; the live database is only read).
2. Upload it under a backup name: `fly ssh sftp shell --app <app>`, then `put <local copy> /data/backups/backup-<YYYY-MM-DD>-import.sqlite`, and make sure the `node` user owns it (`fly ssh console -C "chown node:node /data/backups/backup-<...>-import.sqlite"`).
3. Signed in to the instance, restore that backup: an empty instance shows the backup list on every page, otherwise use Settings → Backups. Restore checks integrity, schema version and that a snapshot exists, and takes a safety backup first; receipts, approvals and the store ID already on the instance are kept.
4. Compare the instance with the local app (snapshot time, counts on Home, Review receipts). Keep the local 8767 service running as the fallback.

## Limits

- Rate limits and the sign-in cookie are per machine and in memory; the design assumes one machine.
- Sign-in depends on Google being reachable. If it is not, use the local app.
- Ingest does not record a routine run; the caller (#56) should report its own run status.
- Calendar writes are unchanged: they still follow the approved Q-version procedure from the owner's assistant, not from the hosted server.
