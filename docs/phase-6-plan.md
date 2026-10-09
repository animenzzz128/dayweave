# Phase 6 plan (proposal)

Status: **proposed, not accepted.** Epic #20 under milestone 1. The outcomes, names and acceptance below are proposals. Milestone 1 requires user-approved Phase 6 acceptance, so no task is implemented until the user approves concrete acceptance for that task. Broad permission to continue is not approval.

## Current capabilities (baseline `1bd6aa9`)
- Effort: `src/store.cjs` stores source estimates and cumulative local actual minutes (finite, nonnegative) separately. There is no confirmed final effort, frozen estimate or calibration. In `src/web/app.js` the Coursework actual-minutes input shows a missing value as `0`, and clearing it saves `0`. Settings lists estimate/actual pairs and notes that effort is cumulative.
- Workload: `src/core.cjs` classifies required/selectable/uncertain work; routed views and `src/routine.cjs` flag failed/unavailable sources. Workload modes do not exist.
- Career: `src/phase3.cjs` can rank with supplied editorial scores and exclusions, but the routed Career page does not call it. User statuses exist; learned preferences do not. Eligibility reports some gaps; missing profile facts are not handled comprehensively.
- Trends: the weekly career summary counts latest statuses updated within seven days, not transitions. SQLite keeps source snapshots for 30 days, progress audit entries and runs; the health API exposes only the latest 30 runs.

## Tasks
Each task is a separate issue and focused PR.

| Task | Proposed outcome | Dependencies and data |
| --- | --- | --- |
| #26 6A effort calibration preview | Descriptive median actual/estimate ratio from explicitly confirmed samples; "Insufficient data" below three samples; nothing is adjusted automatically. | Recommended first. New progress kind, no `user_version` change, no backfill. |
| #27 6B workload modes | Explicit local mode changes a labelled advisory focus view; selectable work stays labelled and reachable; verification and coverage warnings always visible. | Independent. Mode names/ordering need a user decision. Old databases default to the standard mode. |
| #28 6C feedback ordering | Order within each Roles/People list by explicit saved status, exclusions and deterministic ties, with a visible reason; unknown eligibility stays unknown. | Independent; no schema change expected. Which statuses count as feedback needs a user decision. |
| #29 6D weekly evidence trends | Compare two dated weeks from retained snapshots with observation counts; "No observations" is not zero; failed sources stay visible. | Independent if limited to existing snapshots; needs a bounded store query/API. Metric list needs a user decision. |

All four touch `src/web/app.js`, and some share store code and tests. Implement them sequentially by default; separate PRs do not make concurrent writers safe.

## Recommended first task: 6A
Small, reversible and conservative with existing data. It exercises local persistence and real UI acceptance without changing scheduling or ranking.

1. **Sample contract.** Progress kind `effortCalibration`, keyed by stable assignment ID. The value freezes `estimateMinutes` and `actualMinutes` with a server-generated `confirmedAt`. Confirmation needs a known assignment, a finite positive estimate and an explicitly recorded finite positive actual. Zero actual stays valid progress but is excluded from calibration. Confirmation is local evidence, not proof of submission. Editing actual minutes invalidates that assignment's confirmation. Source refresh does not rewrite the frozen pair, and removed source records do not erase it. An explicit clear action exists.
2. **Pure calculation.** A small helper (proposed `src/effort.cjs`) validates samples and returns the median ratio, sample count and exclusions. One sample per assignment ID; at least three samples; labelled descriptive and user-reported, not a prediction. No per-course models, automatic estimate replacement, outlier handling or dependencies.
3. **Persistence and UI.**
   - `src/store.cjs`: validated confirm and clear operations, with invalidation atomic with actual edits.
   - `src/server.cjs`: protected endpoints that derive frozen values from stored records, not client-supplied pairs.
   - `src/web/app.js`: distinguish missing actual from recorded zero, add confirm/clear controls and the Settings summary.
   - Also load the helper before the app in `src/web/index.html` and the asset map, and add it to `npm run check`.
   - Document the sample contract and limits in `data-contract.md`, `project-state.md` and `decisions.md`.
4. **Tests.**
   - Helper: zero to three samples, known median, invalid inputs, ID deduplication, no input mutation.
   - Store: restart/refresh persistence, invalidation on edit, frozen pair stable, clear/reconfirm, old databases empty.
   - Server: unknown/malformed confirmation rejected under existing session/Origin/CSRF controls.
   - Web: scripts in page order, missing versus zero, insufficient and calibrated states, escaping.
5. **Browser acceptance** (synthetic database, development port):
   - On `/coursework` record and confirm effort, then check `/settings` at two and three samples.
   - Edit actual minutes and observe the confirmation is invalidated.
   - Reload, use back/forward, clear and reconfirm with no console errors.
   - Smoke-check `/home`, `/timetable` and `/review`.
   - Use only synthetic screenshots.

**Migration and rollback.** The JSON progress table already accepts new kinds, so backup and export include samples; test round-trip. Older code could keep confirmations without invalidating them after actual edits, so revalidate confirmations against current actuals on read. Never restore an old database just to roll back code.

## Limits
- Effort samples, career feedback and worker logs stay private; tracked fixtures are fictional. No external reads or writes, Email, deployment or new runtime dependencies.
- Phase 5 stays NO-GO (#19). Workflow adoption (#21) and scheduled-refresh acceptance (#18) are separate requirements; completing Phase 6 tasks does not prove workflow efficiency.
