# Dayweave

**Turn coursework and calendar evidence into a clear, reviewable daily plan.**

Dayweave is a local Node.js + SQLite web app for deadlines, assignment checklists, focused work blocks, and proposed calendar changes. It keeps the distinction between **what a source says**, **what the assistant recommends**, and **what you approve** visible.

The repository contains reusable application code and fictional examples only. Personal records, account connections, rendered private dashboards, and automation state belong outside Git.

## Features

- Shows three daily priorities, assignments due within 72 hours, a seven-day preview, and items needing verification.
- Separates submitted work, required work, and selectable response opportunities.
- Provides expandable requirements, local checklists, and estimated/actual effort tracking.
- Displays verified calendar events beside editable study proposals.
- Prepares an immutable Q-number for explicit confirmation in assistant chat. **The dashboard itself never writes to a calendar or learning platform.**
- Rejects proposals that overlap known commitments, fall outside verified coverage, occur in the past, or reuse an executed action ID.
- Retains source records on collection failure, marks stale snapshots, and keeps 30 days of local snapshots.
- Recommends daily focus blocks from your todos and required coursework on request: deterministic, inside fresh complete Google Calendar coverage, 09:00–24:00, at most 90 minutes each with rest gaps and at least 20% left free. Recommendations are proposals; nothing is written without an approved Q version.
- Keeps explicit local todos; an email becomes a todo only when you adopt it and confirm its title, due date and duration.
- Shows the last collected read-only Gmail snapshot (inbox, last seven days, at most 50 messages) with its collection time and coverage. Nothing is sent, deleted or labelled.
- Includes a reusable operating prompt for an assistant-driven refresh workflow.

Career cards now support source-backed roles and networking candidates, eligibility gaps, local save/dismiss/status tracking, draft requests, progress import and a seven-day activity summary. Research is supplied by the assistant, not by a background scraper. Drafts are never sent. See [Phase 3](docs/phase-3.md).

## Web demo (new front end)

The `web/` folder holds the new bilingual front end. Its public demo runs entirely in the browser on a fictional student, Luna; nothing connects to an account and visitor changes stay in that browser.

```sh
cd web
npm ci
npm run dev          # demo mode, http://127.0.0.1:5173
npm run dev:server   # the same UI against a Dayweave server on port 8768 (synthetic data)
npm run build        # static output in web/dist, ready for GitHub Pages
```

The planning rules are the shared `src/*.cjs` modules, evaluated by the web build. The root package keeps zero runtime dependencies; the web app's dependencies live in `web/package.json`.

## Start the web app

```sh
node scripts/init.cjs
node scripts/db.cjs migrate .local/data.json
node scripts/serve.cjs
```

For a supervised start (one verified owner, port reserved before the database opens, bounded restarts, fixed exit codes), see the [launcher guide](docs/launcher.md).

Open http://127.0.0.1:8767/home. Import legacy browser progress under Settings → Backups before retiring the old page. See [migration and recovery](docs/phase-4.md) and the [Luna evaluation set](evals/luna-routine/README.md). Source collection and approved calendar execution still require an authorized assistant; this app has no autonomous external-write channel.

## Try the legacy synthetic demo

Requires **Node.js 24 or newer**. There are no third-party runtime dependencies and no install step.

```sh
git clone <your-repository-url>
cd dayweave
npm test
npm run demo
npm run preview -- --demo
```

Open `http://127.0.0.1:8766`, or open `dist/demo.html` directly in a browser. Stop the preview with Ctrl+C. The demo uses fixed fictional dates so stale-data behavior is reproducible. It is not a live schedule.

## Use your own data privately

```sh
npm run init:local
# Replace .local/data.json with your verified snapshot.
npm run build
npm run preview
```

The initializer preserves existing local data. Set `DAYWEAVE_DATA_DIR` to an external private directory if preferred. The `dist` output and local state are ignored by Git, but the generated HTML embeds the snapshot: **treat it as private whenever its input is private**.

Merge a newly collected snapshot:

```sh
node scripts/render.cjs /path/to/private/incoming.json
```

Rendering does not collect data. An authorized assistant or future adapter supplies the snapshot. See [the data contract](docs/data-contract.md) and [operating prompt](docs/operating-prompt.md).

## Phase 2 additions

Google Calendar writes follow a root-assistant procedure with a local verify/recheck/pending/read-back/reconcile tool after explicit chat approval of an exact Q version ([Google](docs/google.md#approved-google-calendar-writes-root-procedure)); the app itself never writes. Calendar requests include exact account and event fields, bounded daily/weekly recurrence checks, individually reviewed personal-event updates, and a local pending/verified action journal. Assignment help offers outline, draft, review, and explanation requests with user-supplied notes. See [the Phase 2 workflow](docs/phase-2.md) for execution and account-dependent acceptance requirements.

## Daily workflow

1. Collect current learning-platform and calendar evidence using authorized tools.
2. Update the private snapshot, preserve failures, and render the fixed dashboard.
3. Read priorities and source-health notices; expand assignment checklists as needed.
4. Edit/select calendar proposals and prepare a request.
5. Review and explicitly send that request to your assistant. It must recheck the live calendar, avoid duplicates, execute only approved actions, and verify results.

Checklist progress, edited proposals, and review selections stay in browser-local storage. A page reload retains that local state; a changed proposal fingerprint invalidates its old selection. Different browsers, file URLs, and preview origins have separate stores. Export progress if the assistant needs it for planning. No browser state is silently uploaded.

## Scheduling and integrations

The application is provider-independent at the file boundary. The reference workflow reads Canvas, syllabus-linked course sites, Gmail (read-only) and Google Calendar through an external assistant's authorized connectors ([Google procedure](docs/google.md)). Legacy Outlook snapshots remain readable. **No OAuth client, token store, scraping service, or scheduler is included.**

Configure a recurring task in your assistant using the operating prompt. A local task needs the machine and relevant app/browser session available. A successful interactive run does not establish unattended reliability; test the first scheduled run and report failures explicitly.

Timezone is an IANA name in `snapshot.timezone` (example: `America/New_York`). V1 planning defaults protect 00:00–09:00 and target an 08:00 refresh. These defaults are documented rather than inferred from account information.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/` | Fixed interface, browser interactions, pure date/validation logic |
| `scripts/` | Initialize, render, preview, and check tracked files |
| `examples/` | Synthetic fixture using only `example.com` links |
| `test/` | Deadline, timezone, proposal, failure-retention, and rendering tests |
| `docs/` | Data contract, operating workflow, roadmap |
| `.local/` | Ignored personal snapshots and history |
| `dist/` | Ignored rendered output; may contain personal information |

## Development

```sh
npm run check
npm test
npm run demo
npm run privacy
```

The privacy check scans **tracked files**. Run it after staging the intended changes. It catches common secret patterns, local paths, private/runtime filenames, and real URLs in the demo fixture; it cannot prove arbitrary prose is anonymous. Review diffs manually before every push.

Use a short branch per change and one focused pull request. Create an issue for a substantial feature, uncertain requirement, or deferred bug; small fixes can go directly to a PR. See [CONTRIBUTING.md](CONTRIBUTING.md), [CHANGELOG.md](CHANGELOG.md), and [the roadmap](docs/roadmap.md).

## Boundaries and limitations

- Source availability and accuracy depend on the collecting assistant and user access.
- A group assignment with no visible receipt remains uncertain, not automatically overdue.
- Course-specific AI rules and personal input requirements must be read before drafting.
- A static dashboard cannot enforce permissions in a separate assistant or remote service. Explicit approval and live verification are operational requirements.
- Opening an old file does not refresh its data; rebuild and reload it.
- No analytics, telemetry, external fonts, CDN scripts, or outbound data requests are included in the dashboard.

## License and public release

No open-source license has been selected yet; this package is marked `UNLICENSED` and private. Before changing repository visibility, choose a license and complete the [publication checklist](SECURITY.md#before-making-the-repository-public). The repository is structured for that transition without including a personal-data history.

## Phase 4 workbench
The primary interface is now a local multi-page Node 24 + SQLite application. Start with `node scripts/db.cjs migrate /private/data.json`, then `npm run serve`. See [Phase 4 migration, approvals and backups](docs/phase-4.md). Existing static render/preview commands remain legacy compatibility tools; `export:html` produces a read-only database export. Email shows a read-only Gmail snapshot.

## Phase 6 additions (1.5.5)

Four local, advisory features, none of which changes estimates, schedules anything or acts outside the app:

- **Effort calibration** (Coursework, Settings): confirm actual minutes per assignment; Settings shows a descriptive median actual/estimate ratio once three samples exist.
- **Workload modes** (Home): Standard or Reduced focus; Reduced lists urgent required work first and keeps everything else, including verification and coverage warnings, visible.
- **Career feedback ordering** (Career): saved items first, dismissed items last with Restore; unassessed eligibility stays labelled.
- **Weekly evidence trends** (Settings → Weekly trends): two dated weeks compared from retained snapshots, with "No observations" instead of zero and no change shown when coverage is limited.

Try each with synthetic data using the [Phase 6 acceptance guide](docs/phase-6-acceptance.md). Behavior and limits: [project state](docs/project-state.md) and [data contract](docs/data-contract.md).

## Sustainable development

Start with [current state](docs/project-state.md), [architecture](docs/architecture.md), [workflow](docs/development-workflow.md), [decisions](docs/decisions.md) and [roadmap](docs/roadmap.md). Use one task/branch/PR per outcome. Stable runtime is an independent pinned checkout; development uses synthetic data and its own port. Deployment/account manifests stay outside Git.
