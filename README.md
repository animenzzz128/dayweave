# Dayweave

**Turn coursework, calendar and email evidence into a clear, reviewable daily plan.**

Dayweave is a Node.js + SQLite planner for one student. It runs locally or as a single-owner private web instance, collects the day's sources once a day in the cloud, drafts a full day plan, and writes to Google Calendar only after the owner approves an exact version. It keeps the distinction between **what a source says**, **what the assistant recommends**, and **what you approve** visible.

The repository contains reusable application code and fictional examples only. Personal records, account connections, rendered private dashboards, and automation state belong outside Git.

**Public demo:** https://animenzzz128.github.io/dayweave/ (fictional student, English and Chinese, runs in the browser).

## Highlights (October 2026)

- **In daily use as a private instance.** Deployed on Fly.io behind Google sign-in for one allowlisted account, with an encrypted volume and daily backups ([private instance](docs/private-instance.md)).
- **Daily cloud collection, no laptop needed.** A Claude cloud scheduled task reads Google Calendar, school mail (Gmail `label:Yale`), the Canvas feed and two course sites through read-only connectors every morning, builds the next snapshot, dry-runs it and imports it ([cloud collection](docs/cloud-collection.md)). Failed reads keep earlier records and show as stale, never as empty.
- **A full day plan, not just a task list.** The planner fills the day from the owner's rules: interview prep first, then work due within 72 hours, weekly goals (gym, job applications, LinkedIn outreach), quiz and exam review, with meals kept free and 20% of the day left open. The Plan page lets you drag, resize and lock blocks, shows planned against free minutes, and approves the day as one version.
- **Approval-gated calendar writes.** Approve Q-N on the site; a separate cloud executor re-reads the live calendar, records pending, creates each event once, reads it back and records the result. The instance never holds Google write credentials, and nothing is retried blindly ([calendar executor](docs/cloud-execute.md)).
- **AI where it can be checked.** Cited daily briefs, assignment breakdowns, email triage (reply, action, info, interview) and effort estimates from assignment instructions are validated against their evidence; owner edits always win. The 21-case evaluation re-scored 61/63 after a validator fix ([In-product AI](#in-product-ai-in-the-demo)).
- **Cost near zero.** The site and the daily collection make no model API calls (the collection runs inside a Claude cloud session). Only the offline demo scripts call the API, defaulting to Claude Haiku 5.5 with a US$0.25 cap per run, down from US$1.71 for one Opus evaluation run ([decision](docs/decisions.md)).
- **Tested guardrails.** 247 automated tests cover deadlines and time zones, overlap and coverage checks, failure retention, approval binding and the calendar write journal; CI also runs a privacy scan of tracked files and the demo build.

## Features
## Features

- Shows three daily priorities, assignments due within 72 hours, a seven-day preview, and items needing verification.
- Separates submitted work, required work, and selectable response opportunities.
- Provides expandable requirements, local checklists, and estimated/actual effort tracking.
- Displays verified calendar events beside editable study proposals.
- Prepares an immutable Q-number for explicit approval, on the private instance's Review or Plan page or in assistant chat. **The app never writes to a calendar or learning platform itself;** approved Google Calendar creates go through a separate executor that verifies and records each step.
- Rejects proposals that overlap known commitments, fall outside verified coverage, occur in the past, or reuse an executed action ID.
- Retains source records on collection failure, marks stale snapshots, and keeps 30 days of local snapshots.
- Recommends daily focus blocks from your todos and required coursework on request: deterministic, inside fresh complete Google Calendar coverage, 09:00–24:00, at most 90 minutes each with rest gaps and at least 20% left free. Recommendations are proposals; nothing is written without an approved Q version.
- Keeps explicit local todos; an email becomes a todo only when you adopt it and confirm its title, due date and duration.
- Shows the last collected read-only Gmail snapshot (inbox, last seven days, at most 50 messages) with its collection time and coverage. Nothing is sent, deleted or labelled.
- Includes a reusable operating prompt for an assistant-driven refresh workflow.
- Sorts mail into To handle, For reading, Promotions and Handled with AI triage labelled as AI; the owner can reclassify or mark handled, and adopting mail as a todo is prefilled for confirmation.
- Explains the day with AI only where it can be checked: cited briefs, assignment breakdowns and one-line proposals are validated against their evidence and fall back to rules when they fail (see [In-product AI](#in-product-ai-in-the-demo)).

Career cards now support source-backed roles and networking candidates, eligibility gaps, local save/dismiss/status tracking, draft requests, progress import and a seven-day activity summary. Research is supplied by the assistant, not by a background scraper. Drafts are never sent. See [Phase 3](docs/phase-3.md).

## Daily plan (Plan page)

- **Rules.** Working hours, kept-free breaks and weekly goals (count, length, allowed days and hours) are saved on the Plan page. Recommended defaults: 09:00–24:00, lunch and dinner free, Gym 3×60, Job applications 4×60, LinkedIn connect 5×30.
- **Order.** Interview prep (from email triaged as `interview`), then work due within 72 hours, then weekly goals, then the rest. Quizzes get 60 minutes of review over the two days before; exams 240 minutes over five days, at most 120 a day.
- **Editing.** Drag to move, drag the lower edge to resize, ±15-minute nudges. An edited block is locked, so regenerating keeps it; blocks of an approved version are locked too, so a refresh never invalidates an approval before the write.
- **Drafts every morning.** After each import the server drafts today (the time left) and tomorrow. A day with a planning gap, such as incomplete calendar coverage, keeps its blocks.
- **Estimates.** The collection task estimates open work from the instructions it already reads; these are labelled "AI estimate from the instructions", fill only empty or earlier AI estimates, and change only when the instructions change.

## Web demo (new front end)

The `web/` folder holds the bilingual front end used by both the public demo and the private instance. Its public demo runs entirely in the browser on a fictional student, Luna; nothing connects to an account and visitor changes stay in that browser.

```sh
cd web
npm ci
npm run dev          # demo mode, http://127.0.0.1:5173
npm run dev:server   # the same UI against a Dayweave server on port 8768 (synthetic data)
npm run build        # static output in web/dist, ready for GitHub Pages
```

### In-product AI in the demo

The Luna demo shows three AI features, in English and Chinese. Rules still decide what matters; the model only explains, breaks down or parses, and every output is checked against its evidence before it is shown.

- **Cited daily brief** (Today): each sentence carries numbered citations that open the source record. If a source fails (try "Simulate an outage") or the stored text fails the checks, the brief falls back to rule-written text and says why.
- **Assignment breakdown** (Coursework): an "AI suggestion" with steps that quote the assignment text. Accept, edit first, or ignore; the choice stays in your browser.
- **One-line proposals** (Review): a preset sentence becomes a time-block proposal only through the same conflict and coverage checks, and joins the review queue tagged "AI", where it still needs exact-version approval.

`src/ai.cjs` builds the evidence pack and validates every output: unknown citations, uncited sentences, numbers or times not in the cited records, links, claims that something was scheduled, sent or submitted, optional work called required, hidden source failures, and breakdown steps that hand submitted work to AI are all rejected. The site never calls a model; `npm run ai:generate` produces the stored outputs offline with the Claude API (dev dependency only, key stays in the developer's environment), and the browser re-validates them before display.

The [Luna AI evaluation](evals/luna-ai/README.md) has 21 cases (outages, a moved deadline, unknown submission status, optional work, the DST change day, a stale cache, instructions injected into an email and an assignment, vague, conflicting and out-of-scope sentences). The 2026-10-22 run scored 58/63 on first attempts; three of the five failures were a validator bug, fixed with regression tests, and the re-scored result is 61/63. Both numbers and the two remaining failures are on the case study page.

Every merge to `main` publishes the demo to https://animenzzz128.github.io/dayweave/ (`.github/workflows/pages.yml`).

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

The application is provider-independent at the file boundary. The reference workflow reads the Canvas calendar feed, course sites (public schedules plus each course's claude.ai connector), Gmail `label:Yale` (read-only) and Google Calendar through authorized connectors ([Google procedure](docs/google.md), [cloud collection](docs/cloud-collection.md)). Legacy Outlook snapshots remain readable. The repository includes no Google OAuth token store, scraping service or scheduler; the daily run is a Claude cloud scheduled task configured by the owner.

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

Dayweave is released under the [MIT License](LICENSE). Before changing repository visibility, complete the [publication checklist](SECURITY.md#before-making-the-repository-public). The repository is structured for that transition without including a personal-data history.

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
