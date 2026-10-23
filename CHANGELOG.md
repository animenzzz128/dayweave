# Changelog

## Unreleased — Cloud collection (DW-1015, #56)

- `GET /api/ingest` (bearer secret) returns the current snapshot and the Canvas calendar feed read on the server from `DAYWEAVE_CANVAS_ICS_URL`; the feed URL never appears in responses or errors. `POST /api/ingest?dryRun=1` validates and merges without writing and reports the assignments an import would archive; a real import reports them too.
- `scripts/cloud-collect.cjs` (`context`, `build`, `send`) builds the next snapshot from the current one plus Google Calendar and Gmail reads and the Canvas feed. Feed items update due times of matching assignments and add new ones as unknown status and uncertain requirement; failed reads are recorded as failed sources and keep earlier records; a changed calendar or Gmail account stops the run. Procedure for the cloud scheduled task in [docs/cloud-collection.md](docs/cloud-collection.md). Nothing is scheduled yet.

## Unreleased — Private instance (DW-1014, #55)

- Hosted mode in `scripts/serve.cjs`, on only when `DAYWEAVE_PUBLIC_ORIGIN` is set and failing closed when any other variable is missing. One allowlisted, verified Google account signs in (OIDC code flow with state and nonce); no sign-up. Sessions are signed stateless `__Host-` cookies carrying the CSRF token; writes still need it and an exact Origin. Per-client rate limits and HSTS and other security headers. Sidebar sign-out. The local 127.0.0.1 app and the launcher are unchanged.
- `POST /api/ingest` imports a snapshot through `Store.importSnapshot` with a bearer secret from the host's secret store; invalid snapshots return 400 and keep previous records.
- `Dockerfile` (server only, unprivileged user) and `deploy/fly.toml.example` (one machine, encrypted volume, 14-day snapshots). Deploy, backup and private-database import steps in [docs/private-instance.md](docs/private-instance.md); nothing has been deployed.

## Unreleased — School mail via Gmail label

- Gmail collection reads only `label:Yale newer_than:7d`: school mail auto-forwarded into Gmail and labelled by a Gmail filter, so personal mail is no longer read and no school admin consent is needed. Procedure, data contract, routine, state and decisions updated; snapshot validation is unchanged.

## Unreleased — Web demo (DW-1011)

- New `web/` front end (React, Vite, TypeScript, Tailwind) in the "timeline first" design: Today, Coursework, Week, Review, Career, Email and Data health, with an EN / 中文 switch (English default, remembered per browser).
- Demo mode runs entirely in the browser on a fictional student, Luna (`examples/luna-demo.json`). `src/demo.cjs` dates the template around today in its timezone, so the demo never looks stale. Checklists, todos, focus mode, plans and approvals are stored in browser storage; Reset restores the original data; approving simulates the assistant's write and read-back.
- Server mode (`npm run dev:server` in `web/`) uses the existing server API on the development port; the server still enforces sessions, CSRF, validation and approvals.
- The web build evaluates the shared `src/*.cjs` rules (classification, workload focus, planner, approvals guards, email health) instead of reimplementing them.
- CI builds and type-checks the web app and scans the build for secrets, personal paths and non-example email addresses (`node scripts/privacy-check.cjs --dir web/dist`). A manual GitHub Pages workflow is ready for when the repository is public.

## Unreleased — Google providers (DW-GOOGLE-01)

- Email shows the last collected read-only Gmail snapshot: inbox, last seven days, at most 50 messages, metadata and snippets, no attachments. Collection time, coverage, errors and stale/retained labels are explicit; unknown, disabled, failed and partial reads never read as an empty inbox. Send, delete and label capabilities are rejected. Home shows an inbox summary.
- Google Calendar coverage carries provider, source, account, destination calendar ID and the bounded list of calendars read. Only the active calendar source invalidates coverage, so a Gmail failure does not. Provider identity joins new proposal fingerprints; identity changes invalidate prepared versions. Legacy Outlook snapshots stay readable.
- Failure semantics (review round 1): failed and unavailable sources both keep earlier records and last success; the first import applies the same active-calendar invalidation; an omitted email record with a non-ok Gmail source shows as failed with retained messages; a calendar identity switch during a failure shows the new identity and keeps no previous-account events; legacy-shaped coverage cannot describe a Google-only snapshot; `email.enabled` must be boolean.
- Coursework → Todos: explicit local todos (title, explicit due date or none, duration). Email → "Adopt as todo…" creates one only with user-confirmed fields; nothing is extracted from mail.
- Timetable → "Generate recommendations": deterministic daily focus blocks inside fresh complete Google coverage, 09:00–24:00, ≤90 minutes, 15-minute rest gaps, ≥20% free, no past or past-deadline blocks, no double scheduling. Reasons, unscheduled work, gaps and assumptions are shown. Blocks are proposals; regeneration and todo edits invalidate prepared versions. Requests may now end exactly at local midnight.
- Planning safeguards (review round 1): only listed, `ok`, fresh sources give plannable coursework and keep blocks; every occurrence of kept proposals blocks time (unexpandable ones stop planning); started actions keep blocking time and covering work through calendar failures, restores and refreshes, from their frozen approval copies; the 20% reserve holds across repeated generation; past unstarted blocks cover nothing; estimate changes and local archive drop unstarted blocks; truthful future-day deadline reasons; bounded todo count and stored explanation.
- Approved Google Calendar bridge: Q versions bind provider, account, calendar ID, all fields and source task refs; one-time personal creates only (owner calendar, no attendees/invitations/meetings). `scripts/google-calendar.cjs` verifies the exact chat approval and connector field support, checks a fresh live re-read, records pending before the write, compares the read-back and reconciles unknown outcomes without retrying. Review shows receipts with evidence. No credentials, network calls or web execution route.
- Connector profile (review round 1): the bridge maps to the connected Google Calendar create tool's declared arguments (attendees empty, no Meet, default event type) and its raw read shape; no invitation-update setting, client event ID or extended properties are claimed. Approval must be exactly "Approve Q-N"; unreadable or unexpanded live events fail closed; calendar provenance comes from per-calendar reads and is never invented; the store ID and the pending key survive restore.
- Planning safeguards (review round 2): started blocks imported back as calendar events (matched by receipt `remoteRef` or exact approved copy) count as allocated, so the 20% reserve keeps the original day base after refresh; only the copy matching a started action's receipt fingerprint protects time, and imports and restores replace stale same-ID copies with it (including collector proposals), so request checks, planning and the UI use the reviewed time; a started action with no matching copy blocks requests and planning until reconciled; restore re-insertion is transactional; reopening a todo respects the open cap; updates may overlap their own target's executed create; the reserve message shows the day total.
- Bridge follow-ups (candidate round 3): an ambiguous outcome stays held until a complete reconcile finds exactly one marked event; `not_created` needs complete reads 24 hours either side of the action and claims absence only for that window; a not-created action is never retried under its old version, even while another action of it is pending; the legacy receipt commands refuse Google receipts; read-back evidence names the compared fields only; a malformed legacy approval time renders as "Invalid time".
- Calendar guards (#46): every marked event a started claim sees (by any reconcile or read-back, on the destination or another calendar, also in an incomplete or erroring search or with unreadable times) stays on its receipt across outcomes, with its calendar, ID and interval; the same ID on another calendar is a second event, the same event seen again is not. Two or more distinct ones, seen by one search or across several, hold the action; the hold also keeps the valid windows and read calendars of searches that saw several, and only a complete single match covering all of it (at least 24 hours either side) clears it. With one seen, only that event is read back, and `not_created` is refused. A hold with no recorded scope, an unreadable one, one started by a search without valid bounds, a marker with unreadable times or no ID, or an outcome recorded before marked events were kept has an unknown range: it stays unknown, nothing is invented, and only the human can resolve it (no command records that yet). Receipt history keeps each earlier state's version, so every version an action was not created under stays refused for new pending claims after later attempts, restore and import, while a claim that already started still records its outcome. Snapshot imports reject receipts the local journal lacks when they look like Google receipts (provider, bridge fields, `account`, `sourceRefs`, `minutes`, structured approval, Google proposal or approval copy) and, while either coverage is Google, unless they belong to an Outlook proposal already stored locally; local receipts always win and Phase 4 Outlook receipts still import under Outlook coverage. Review reads "Not created · absent in searched window" and names each earlier state's version. Docs call these consistency guards, not authentication, and name restore of a local backup as trusted.
- Supervising launcher (DW-1006): `scripts/launcher.cjs` (`start`, read-only `status`, `stop`) runs the app for one pinned checkout as an owned child. One owner per state directory via an atomic lock and a secret challenge-response; PIDs, HTTP 200 and banners are never identity. The port is reserved before the Store opens; foreign listeners, unverifiable holders and identity mismatches fail closed with fixed exit codes and nothing is terminated; stale locks are recovered only when provably dead. Diagnostics fall back through primary, fallback and temp logs to stderr without a recursive handler. Bounded restarts with retained failure history. `src/app-server.cjs` is the shared app assembly for `scripts/serve.cjs` (unchanged behavior). Fictional examples in `examples/launcher/`; [guide](docs/launcher.md). Not deployed; real sign-in and recovery not tested.
- Synthetic Google-only example (`examples/google-snapshot.json`) and the [collection procedure](docs/google.md). No OAuth client, token store or new dependency.

## 1.5.5 — 2026-10-11

Phase 6 initial completion (#20): the four approved Phase 6 features (#26–#29). Every change is local, advisory and reversible. No schema `user_version` change and no new runtime dependency. See the [Phase 6 acceptance guide](docs/phase-6-acceptance.md).

Released on 2026-10-11 as tag v1.5.5 at the reviewed commit 2ab5e0b, which contains all four features. The tag never moves; later revisions that keep version 1.5.5 are not the tagged release. The version and tag do not mean every feature is merged to main or deployed. As of 2026-10-11 after the release, #26 (PR33), #27 with #28 (PR34, which carried the PR35 squash of #28) and #29 (PR36) are merged into main and issues #26–#29 are closed, while the version and documentation update (PR37) remains open. PR37 merged later on 2026-10-11 (15a2b99), and its code equals the tag. As of 2026-10-13 the stable runtime's pinned revision contains it ([status](docs/project-state.md)).

- Effort calibration (#26): Coursework records actual minutes (blank means not recorded, not 0) and explicitly confirms per-assignment effort samples. Settings shows a descriptive median actual/estimate ratio from at least three confirmed samples, otherwise "Insufficient data". Zero actuals are excluded and editing actual minutes removes the confirmation. Nothing adjusts estimates or plans.
- Workload modes (#27): Home has a Standard (default) / Reduced focus mode. Reduced lists overdue and 72-hour required work first and keeps other required work, selectable work, verification items, source health and calendar coverage limits visible.
- Career feedback ordering (#28): Career Roles and People list saved items first and dismissed items last with Restore, otherwise in source order. Profile facts that eligibility cannot assess are labelled "not assessed", never eligible.
- Weekly evidence trends (#29): Settings → Weekly trends compares two dated Monday–Sunday weeks in the snapshot timezone from retained snapshots, by collection time with import time shown separately. It shows required-work counts by status and per-source health, says "No observations" instead of 0, and shows no change when coverage is limited.
- Documentation: Phase 6 acceptance guide, post-merge reconciliation steps for dependent branches, and a corrected statement of the bounded weekly-trends read.

### Not in this release

- Not a deployment. The stable runtime keeps its separately pinned revision until an explicit promotion.
- The coordinator/worker workflow is still a trial (#21), and scheduled-refresh acceptance (#18) is separate. Phase 5 remote execution stays NO-GO (#19).
- Collection is still assistant-driven, Email stays disabled, and calendar or submission actions still need explicit chat approval.

## 1.5.0 — 2026-10-08

First static-dashboard to local-web-app milestone.

- Separate summary Home and routed module pages with current/history views.
- Node24 SQLite storage, durable progress, migration, paginated audit and 30-day backups.
- Immutable Q-number review batches, changed-version invalidation and verified outcome tracking.
- Bounded standalone routine policy, twice-weekly research and observed usage records.
- Fictional Luna routine evaluation cases, prompt generator, strict scorer and regression tests.
- Read-only HTML fallback; external calendar execution still requires explicit chat approval.

### Earlier unreleased improvements

- Exact calendar action requests, bounded recurrence with DST checks, single personal-event updates and a pending/verified action journal.
- Assignment help dialog with saved user notes, requested help mode and safeguards for personal classroom responses.
- Stronger invalid-date checks and durable execution-history preservation.
- Account-dependent live save/read-back and unattended execution remain acceptance steps.

## 1.0.0 — 2026-10-07

Initial reusable release of Dayweave.

### Added

- Self-contained local dashboard with coursework, priorities, timetable, review queue, career/email extension sections, and source health.
- Editable one-time calendar proposals and explicit chat approval-request generation.
- Submission-aware assignment classification, timezone-aware dates, overlap checks, duplicate-action protection, and stale-data notices.
- Failed-source snapshot preservation and 30-day local snapshot retention.
- Synthetic demo, isolated runtime data directory, local preview server, tests, CI, privacy guard, and reusable operating instructions.

### Known limitations

- Refresh orchestration and authenticated reads are supplied by an external assistant.
- Career discovery and email triage are not enabled implementations yet.
- V1 sleep/refresh defaults are fixed; account authentication, configurable routines, and unattended reliability need further work.

## Unreleased — Phase 3
- Career profile, evidence cards, eligibility warnings, local status controls and draft requests.
- Whitelisted career progress import, canonical profile deduplication and seven-day summary.
- Retain career data on refresh failure. Email stays disabled.

## Unreleased — Phase 4
- Bounded routine policy and observed metrics.
- SQLite migration, persistent progress, backups and loopback API.
- Routed summary-first workbench and paginated module history.
- Immutable Q-number review and verified local receipt workflow.
