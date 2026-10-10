# Phase 4 local workbench

Requires Node 24. No external runtime dependencies or paid hosting. Private runtime files must remain outside Git.

## Start and migrate

Set DAYWEAVE_DATA_DIR to a private directory. Run `node scripts/db.cjs migrate /path/to/data.json` once, then `node scripts/serve.cjs`. Open http://127.0.0.1:8767/home. The SQLite database is authoritative; changing the old JSON does not update the app.

From the legacy page export browser progress, then import the JSON in Settings → Backups. Existing database values win. Browser exports carry no approval authority. Browser-local selections and edited proposals are deliberately not promoted to executable requests. Retain the original export and migration input for rollback.

The app has independent Home, Coursework, Timetable, Review, Career, Email and Settings routes. Current and History tabs separate actionable records; large lists paginate at 20. A date bar links to filtered coursework. Confirmed events and proposed blocks have different colors. Unknown coverage stays visible.

## Collection and receipts

Export current source records with `node scripts/db.cjs export /private/current.json`; collect bounded changes, then `node scripts/db.cjs import /private/incoming.json`. Failed sources retain their prior data. Progress is never replaced by source imports. Import observed run metrics with `node scripts/db.cjs run /private/run.json`. Settings → Weekly trends reads retained source snapshots through a read-only, bounded query (`GET /api/trends`); see the [trends contract](data-contract.md#weekly-evidence-trends-phase-6d-29). See routine.md for cadence and collection budgets. Use deterministic categories before model summarization.

Prepared review batches have immutable Q-number references. After the human explicitly approves that reference in chat, use `node scripts/approval.cjs read Q-1`, re-read the live calendar and recheck each exact proposal. Editing invalidates old prepared references. Local selections and prepared IDs are not authorization.

Record pending before remote save using `node scripts/approval.cjs record /private/receipt.json`. Receipt includes reference, id, status, recordedAt, humanApproval evidence for pending, and the proposal fingerprint. Executed requires verifiedAt, remoteRef and read-back evidence. Uncertain saves use unverified; confirmed no-event failures use not_created with evidence. Never retry an ambiguous save. The CLI writes a local receipt, not Outlook. The website exposes no receipt-write or authorization endpoint.

Backups retain 30 days and restoration first backs up the current database. Current execution receipts and approval references survive restoration; prepared approvals invalidate. Compact audit history is retained. JSON export and `node scripts/export-html.cjs output.html` provide private portable data/read-only views. Restoring a database does not undo remote calendar events.

## Security and rollout

The HTTP server binds only to loopback; Host, Origin, session cookie and CSRF token are checked. No CORS, outbound calendar calls or inbox reads. The old static preview is a legacy tool; use the database workbench for live progress.

Four stacked PRs separate routine policy, storage/API, pages, and approvals/acceptance. No automatic merge or release. Phases 5–6 remain future work. Test the standalone routine before replacing the previous schedule, then inspect the first week; shared quota percentages are not attributable per-run cost.
