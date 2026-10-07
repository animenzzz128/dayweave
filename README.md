# Dayweave

**Turn coursework and calendar evidence into a clear, reviewable daily plan.**

Dayweave is a local-first HTML dashboard for deadlines, assignment checklists, focused work blocks, and proposed calendar changes. It keeps the distinction between **what a source says**, **what the assistant recommends**, and **what you approve** visible.

The repository contains reusable application code and fictional examples only. Personal records, account connections, rendered private dashboards, and automation state belong outside Git.

## What v1.0.0 does

- Shows three daily priorities, assignments due within 72 hours, a seven-day preview, and items needing verification.
- Separates submitted work, required work, and selectable response opportunities.
- Provides expandable requirements, local checklists, and estimated/actual effort tracking.
- Displays verified calendar events beside editable, one-time study proposals.
- Prepares an approval request for the user to review and paste into their assistant chat. **The dashboard itself never writes to a calendar or learning platform.**
- Rejects proposals that overlap known commitments, fall outside verified coverage, occur in the past, or reuse an executed action ID.
- Retains source records on collection failure, marks stale snapshots, and keeps 30 days of local snapshots.
- Includes a reusable operating prompt for an assistant-driven refresh workflow.

Career and email sections are intentionally inactive extension points in v1. They do not implement job discovery, networking recommendations, or inbox scanning yet.

## Try the synthetic demo

Requires **Node.js 22 or newer**. There are no third-party runtime dependencies and no install step.

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

## Daily workflow

1. Collect current learning-platform and calendar evidence using authorized tools.
2. Update the private snapshot, preserve failures, and render the fixed dashboard.
3. Read priorities and source-health notices; expand assignment checklists as needed.
4. Edit/select calendar proposals and prepare a request.
5. Review and explicitly send that request to your assistant. It must recheck the live calendar, avoid duplicates, execute only approved actions, and verify results.

Checklist progress, edited proposals, and review selections stay in browser-local storage. A page reload retains that local state; a changed proposal fingerprint invalidates its old selection. Different browsers, file URLs, and preview origins have separate stores. Export progress if the assistant needs it for planning. No browser state is silently uploaded.

## Scheduling and integrations

The application is provider-independent at the file boundary. The reference workflow supports reading Canvas, syllabus-linked course sites, and Outlook through an external assistant's authorized tools. **No OAuth client, token store, scraping service, or scheduler is included.**

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
