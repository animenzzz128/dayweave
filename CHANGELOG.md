# Changelog

## Unreleased — Career: a real application tracker

- The private Career page is now a tracker instead of a read-only research list: **Applications** (stages from "want to apply" to offer, closed ones folded away), **Contacts**, and the assistant's earlier **research** as its own tab.
- Add a posting by hand (title, company, link, market, city, track, deadline, channel, next step, notes). "I applied", the stage menu and notes add dated entries to the job's history. The same link (ignoring query and anchor) cannot be added twice.
- Next steps list deadlines within 7 days, due next steps, applications quiet for 7 days and contact follow-ups. Counts: applied in the last 7 days against the weekly job-application habit, reply rate, interviews, in progress.
- The research roles and people are copied into the tracker once (dismissed ones stay out; applied/contacted marks carry over).
- Nothing is applied for, sent or signed in to: a stage change records what the owner did on the company's own site. The public demo keeps its preview panels for now.

## Unreleased — Plan: one main button, days you can swipe

- The Plan page has one main button: approve the day. "Plan the next 7 days" is a secondary button and "Regenerate this day" a text action.
- The seven days scroll sideways on phones instead of wrapping onto three rows, and each day shows a thin bar of planned against usable minutes (amber above 80%).
- On phones the day's approve button stays above the tab bar while the timeline scrolls; once a version is prepared it leads to that version's approval. It runs the same step as the button in the page.
- Review's "Try" sentences are left-aligned body text instead of small monospace chips.

## Unreleased — Today leads with what is now and next

- Today opens with one lead card: what is on the calendar now (until when) and next today, the most urgent piece of work, and a link to the plan. It reads the same events and blocks as the day timeline and changes nothing. When the calendar read is incomplete, an empty rest of the day is not called free.
- The four counts sit beside it (in one row of four on phones, with short labels). Only overdue work is coloured; the coloured side bars are gone.
- Today's brief is a plain card with a small heading instead of a large blue block, and the day and workload switches are 36 px tall.

## Unreleased — Clearer type and button hierarchy

- One type scale: page titles 24 px on phones and 28 px on wider screens, section notes 13 px, and nothing smaller than 12 px (timeline times, chips, counts and labels were 11 px). Digits in monospace line up (tabular figures).
- Buttons come in three tiers: primary (one per view), secondary and a quiet text action; a red outline marks actions that remove or overwrite (withdraw approval, restore a backup, remove a block, delete a rule). Dismiss, cancel and clear-estimate are now quiet text actions.
- Buttons, fields and tabs are at least 44 px tall on phones.

## Unreleased — Phone layout: bottom tabs and a one-line header

- Phones (under 640 px) get a bottom tab bar with Today, Plan, Review (with its count) and Coursework, plus More, which opens a sheet with Week, Career, Email, Data health, Case study, theme, language and sign-out. Before, the top navigation scrolled sideways and hid Career, Email and Data health.
- The demo and private-instance strip is one short line on phones; Details opens the explanation and the demo controls. The header is one row with the logo and search.
- Wider screens keep the daily pages in the header and put Career, Email, Data health and Case study under More; theme, language and sign-out move into a Settings menu.
- Controls in the header, tab bar and menus are at least 40–44 px tall, and the page respects the iPhone safe areas.

## Unreleased — Planning rules audit

- Fix: a weekly goal asking for more sessions than its ticked weekdays allow (for example 7 a week on Monday–Friday at 1 a day) made the server refuse the whole save, so a new day start such as 08:30 was never stored, plans kept the old 09:00 and a refresh showed the old rules. The page now runs the same check before saving, says in place which goal cannot hold and why (ticked weekdays × per day, not the 7 planned days), keeps Save off until it holds, and marks unsaved edits.
- Saving rules now plans the next 7 days again with them ("Save and plan the next 7 days again"); written blocks that move get a removal and a new block to approve, as before.
- The plan summary names blocks kept because you edited or approved them, and warns when one now sits outside the rules.
- Fix: day views started at 09:00 (or 07:00), cutting an 08:30 class to 09:00. They now start at the saved day start, or earlier at the hour of the first event or block that day; the Week page lines its columns up.
- Tests: every rule (save and reload, day start and end, breaks, daily coursework limit, weekly goals per week/per day/weekdays/windows/colour/off, edited blocks, rewriting a written block after a rule change) through the store's 7-day generation.

## Unreleased — Classic UI retired

- Data health shows the action history (search, dates, status, details, pages of 20) and the last 30 measured runs.
- The classic UI (`src/web/`) is removed. The server serves the web build from `DAYWEAVE_WEB_DIST` or `web/dist-server` (where `npm run build:server` now writes); old paths such as `/home`, `/settings` and `/classic` redirect to the matching page. Without a build, `/` explains how to make one.
- A database with no snapshot offers its backups for restore on the error page.

## Unreleased — Demo writes the calendar the way the private site does

- The public demo's Review page now follows the private instance's direct Google Calendar write: connect Google Calendar once (simulated consent), then "Approve Q-N and write to Google Calendar". The demo rechecks the prepared version live (connection, approval, failed sources, fingerprints and the planner's checks per block), reports each block as written or skipped with the reason, and keeps receipts marked simulated. Withdrawing an approval works as on the site. No calendar is connected or written.

## Unreleased — Demo Plan page starts with drafts

- Fix: the public demo's Plan page opened with no planned day, and Regenerate showed no change because the demo never stored the day's summary. The demo now makes today's and tomorrow's drafts on the first visit of each day (standing in for the morning collection) and keeps the summary the server keeps, so the page shows the planned load and Regenerate updates it.

## Unreleased — Demo: pipeline, interview prep and follow-up rhythm

- Career → Pipeline (demo preview): a five-column board (saved, applied, interviewing, offer, closed) with applications in the last 7 days against the weekly goal, reply rate, interviews, and a next-steps list. An application with no reply 10 days after it went out gets a follow-up nudge naming the contact. Moving a card also updates Job match.
- Interview prep pack for the demo's interview email: format, what to know, five likely questions tied to the posting's requirements, a STAR outline per question that cites the resume line it rests on, and questions to ask. The Plan page's interview prep block links to it.
- People to contact: relationship stage (not contacted, request sent, connected, chatted, referred) with the next step for each, a thank-you draft after a chat, and a mark for sending it. Requests unanswered for 7 days and chats 7 days old are followed up.

## Unreleased — Demo update: job match and people previews

- Public demo, Career page: two "coming soon" previews with fictional data written in advance. Job match ranks roles by an explainable score (40% skills, 30% experience, 20% eligibility, 10% timing; unknown counts as a gap), lists each requirement as met, partly, missing or unknown with its evidence, and reveals resume fixes on Generate. People to contact shows a summary, shared ground, a side-by-side path with meeting points, and three outreach drafts (connection note with a 300-character counter, coffee chat, referral ask) to copy. Nothing is sent or fetched. Statuses and todos stay in the browser. The private instance shows only the assistant's research.
- Demo data shows Phase 6 features: two AI time estimates with their basis (shown in Coursework details) and the recruiter email triaged as an interview, so the Plan page adds interview preparation.
- Case study: current numbers (8 views, 247 tests), the site approval and executor write path, the Plan page and weekly goals, time estimates, and a roadmap with the private instance and daily collection shipped.

## Unreleased — Canvas work without submission status

- Canvas feed work with no readable submission status (no Canvas token) is marked `statusUnread`, counted as required and listed by its due time with a "Status not read" tag, instead of filling Needs verification. Its status stays `unknown`; Mark done records completion. Owner decision 2026-10-27.

## Unreleased — Assignment instructions and submission status from sources

- The Canvas feed's plain-text instructions now fill an empty assignment description, so new Canvas work shows its requirements instead of a bare title. Reviewed descriptions are kept.
- Optional `DAYWEAVE_CANVAS_TOKEN` (Fly secret): the server reads the owner's Canvas planner with one paged GET and sets submission status (submitted, graded, excused, not submitted) and marks work with points as required. Only flags and points are kept; never scores or submission bodies. A refused token makes the Canvas source partial with the reason.
- Course-site connector reads can include instructions (`bodies`), the owner's submissions and quiz submissions. Work with a filled-in submission or a taken quiz becomes submitted, upcoming work without one becomes not submitted, past work without one keeps its status. Submitted values are dropped before the snapshot is built.
- A source status read never turns reviewed submitted, graded or excused work back into not submitted.

## Unreleased — Course sites with an API

- The server reads course sites that run Yelukerest (PostgREST, e.g. `www.656.mba`, `www.802.mba`) with the owner's personal API token from Fly secrets (`DAYWEAVE_COURSE_SITES`, `DAYWEAVE_COURSE_TOKEN_<CODE>`) and returns them to the cloud collector in `GET /api/ingest`. Only GET requests for meetings, assignments (with extension-aware deadlines) and quizzes; never grades or submissions; tokens never appear in responses or errors.
- Cloud builds turn such a course from manual upkeep into a read course: due times update, new work is added with status unknown, withdrawn work is archived, the meeting schedule replaces the public-page read, and the Canvas feed leaves the course alone. An expiring token shows as a source warning 14 days ahead.
- Yelukerest sites accept personal API tokens only from the Yale network, so the cloud task now reads assignments and quizzes through each course's claude.ai connector (list tools only) and `cloud-collect.cjs build` lays `course-connector.json` over the server's public schedule read.
- Course-site meetings show in the timetable as busy class events (skipped where the owner's calendar already has that class), so a course missing from Google Calendar (MGT 802) still appears. A refused token keeps the public schedule and reports the server's reason.

## Unreleased — Leaner Home, bulk marks, Gmail-only mail

- Home is a dashboard instead of a page of text: a source-health pill, four clickable KPI tiles (due in 72 hours with overdue count, needs verification, proposals to review, email to handle), the day timeline in a card, a three-line AI brief with Read all, the next five items, a seven-day due-load bar chart, a Career card (roles, people, saved, the top two roles with an eligibility dot) and a compact source strip. The "three things" cards and the full verification list moved behind the tiles.
- Coursework has **Select**: tick several items (or Select all) and mark them done or not needed at once; in Done, undo several marks. Work the source already shows as submitted cannot be selected.
- Cloud builds drop the retired Outlook calendar/connector and old email-module sources (Gmail `label:Yale` is the only mail source) and clear a previous run's summary and priorities when the run writes no notes.

## Unreleased — New interface on the private instance

- The Docker image builds the `web/` front end in server mode (`npm run build:server`) and `scripts/serve.cjs` serves it at `/` when `DAYWEAVE_WEB_DIST` is set; the classic UI keeps its routes and `/classic` leads there. The hosted banner adds Classic view and Sign out. The page CSP allows the inline theme script by hash. The shared `src/*.cjs` rules are now wrapped at build time (`?shared` imports) instead of being evaluated with `new Function`, so neither the demo nor the private instance needs `unsafe-eval`.
- Gmail messages can carry assistant triage (category reply/action/info/promo, priority, one-line summary and action, stated due time, optional assignment hint), validated in `src/email.cjs`; bodies are still never stored. Owner overrides (`emailTriage` progress: category, handled) are validated by the store. The cloud collection steps now ask the task to read each message and write triage.
- The new Email page sorts mail by triage: **To handle** (needs reply / to do, by priority and stated time), **For reading**, untriaged, and folded **Promotions and spam** and **Handled**. Each message shows the AI summary and suggested action labelled as AI, can be marked handled or reclassified (the owner's choice wins), and adoption as a todo is prefilled from the suggestion and stated time for the owner to confirm. Today shows how many messages are to handle. The fictional demo mail carries triage.
- Coursework in the new front end can mark work **done** or **not needed** (a local mark; the source is unchanged and refreshes keep it), with Undo. Work not done and due more than 3 days ago moves off Today into a **Past due** tab; nothing is deleted. Today's source warnings no longer list manual sources. The server now refuses malformed archive marks.
- Data health in the new front end lists backups and can create one, export the data and restore a backup after a confirmation (server mode only). Manual sources show as "Manual" in neutral colours instead of red.

## Unreleased — Cloud collection (DW-1015, #56)

- `GET /api/ingest` (bearer secret) returns the current snapshot and the Canvas calendar feed read on the server from `DAYWEAVE_CANVAS_ICS_URL`; the feed URL never appears in responses or errors. `POST /api/ingest?dryRun=1` validates and merges without writing and reports the assignments an import would archive; a real import reports them too.
- `scripts/cloud-collect.cjs` (`context`, `build`, `send`) builds the next snapshot from the current one plus Google Calendar and Gmail reads and the Canvas feed. Feed items update due times of matching assignments and add new ones as unknown status and uncertain requirement; failed reads are recorded as failed sources and keep earlier records; a changed calendar or Gmail account stops the run. Hosted startup now also refuses a session or ingest secret with fewer than 12 distinct characters, which catches a value from a failed generator (all zero bytes). Courses outside Canvas can be kept manually: their assignments are labelled "Not auto-updated", and a public course schedule is read for date changes, which show as a source warning for a week. Merged Canvas sites are linked to their course through already matched work. Procedure for the cloud scheduled task in [docs/cloud-collection.md](docs/cloud-collection.md). Nothing is scheduled yet.
- All-day Canvas feed items are due 23:59 in the snapshot timezone (not UTC), and keep a known due time on the same day; an equal instant in another offset is not reported as an update.
- Work filed under per-course Canvas sources from the earlier collector now takes the feed's due dates: a matched source is set back to `ok`, so the import no longer keeps the retained copies. A course whose ID is the Canvas site ID receives new work from that site. A manual course's work is never matched by the feed, and its own non-ok sources get status `manual`, which Home does not list as a warning.

## Unreleased — Private instance (DW-1014, #55)

- Hosted mode in `scripts/serve.cjs`, on only when `DAYWEAVE_PUBLIC_ORIGIN` is set and failing closed when any other variable is missing. One allowlisted, verified Google account signs in (OIDC code flow with state and nonce); no sign-up. Sessions are signed stateless `__Host-` cookies carrying the CSRF token; writes still need it and an exact Origin. Per-client rate limits and HSTS and other security headers. Sidebar sign-out. The local 127.0.0.1 app and the launcher are unchanged.
- `POST /api/ingest` imports a snapshot through `Store.importSnapshot` with a bearer secret from the host's secret store; invalid snapshots return 400 and keep previous records.
- An empty database (a new private instance) now shows the backup list and Restore instead of stopping at "No database snapshot", so an uploaded backup can be restored from the page; a restore reports which backup was restored.
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
