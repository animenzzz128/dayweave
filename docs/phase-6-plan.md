# Phase 6 plan

Status: **acceptance approved; initial completion released as v1.5.5 (2026-10-11).** Epic #20 under milestone 1. The user approved the concrete acceptance of #26–#29 with the defaults under [Approved acceptance](#approved-acceptance). Implementation is delivered as stacked dependent PRs (#26→#27→#28→#29), each merged only on user request. As of 2026-10-11, #26, #27 and #28 are merged into main (PR33 and PR34; #28 reached the #27 branch through PR35), and PR36 (#29) remains open; this revision and the v1.5.5 release contain all four, while main does not yet contain #29. None is deployed or adopted. Manual checks are in the [acceptance guide](phase-6-acceptance.md). Implemented behavior and limits are in [project-state.md](project-state.md) and [data-contract.md](data-contract.md); the task table and 6A steps below are the original proposal. Broad permission to continue is not approval.

## Approved acceptance
The open product choices in the task table were decided as follows:
- #26: at least three samples; median actual/estimate ratio; zero actual excluded; actual edits invalidate a confirmation; required, `choice` and uncertain work are each eligible; only explicit confirmation creates a sample.
- #27: two modes, Standard (default) and Reduced; Reduced lists urgent (overdue or 72-hour) required work first.
- #28: saved items first, dismissed items last and still visible with Restore; all other statuses keep the original source order.
- #29: weeks run Monday–Sunday in the snapshot timezone; counts from the latest read observation in each week, required work by status, plus per-source health.

## Capabilities at planning baseline `1bd6aa9` (historical)
This describes the code before Phase 6 work and is kept as planning context, not current behavior.

- Effort: `src/store.cjs` stores source estimates and cumulative local actual minutes (finite, nonnegative) separately. There is no confirmed final effort, frozen estimate or calibration. In `src/web/app.js` the Coursework actual-minutes input shows a missing value as `0`, and clearing it saves `0`. Settings lists estimate/actual pairs and notes that effort is cumulative.
- Workload: `src/core.cjs` classifies work as `required`, `choice` (selectable) or `uncertain`; routed views and `src/routine.cjs` flag failed/unavailable sources. Workload modes do not exist.
- Career: `src/phase3.cjs` can rank with supplied editorial scores and exclusions, but the routed Career page does not call it. User statuses exist; learned preferences do not. Eligibility reports some gaps; missing profile facts are not handled comprehensively.
- Trends: the weekly career summary counts latest statuses updated within seven days, not transitions. SQLite keeps source snapshots (pruned to 30 days only when a new import runs, and including records retained from failed sources), progress audit entries and runs; the health API exposes only the latest 30 runs.

## Tasks
Each task is a separate issue and focused PR.

| Task | Proposed outcome | Dependencies and data |
| --- | --- | --- |
| #26 6A effort calibration preview | Descriptive median actual/estimate ratio from explicitly confirmed samples; "Insufficient data" below three samples; nothing is adjusted automatically. | Recommended first. New progress kind, no `user_version` change, no backfill. Threshold, median, zero exclusion, invalidate-on-edit and whether `choice`/`uncertain` work counts need a user decision. |
| #27 6B workload modes | Explicit local mode changes a labelled advisory focus view; selectable work stays labelled and reachable; verification and coverage warnings always visible. | Independent. Mode names/ordering need a user decision. Old databases default to the standard mode. |
| #28 6C feedback ordering | Order within each Roles/People list by explicit saved status, exclusions and deterministic ties, with a visible reason; unknown eligibility stays unknown. | Independent; no schema change expected. Which statuses count as feedback needs a user decision. |
| #29 6D weekly evidence trends | Compare two dated weeks from retained snapshots with observation counts; "No observations" is not zero; failed sources stay visible, and records retained from a failed source are not counted as new observations. | Independent if limited to existing snapshots; needs a bounded store query/API. Metric list needs a user decision. |

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

**Migration and rollback.** The progress table stores JSON values for any kind, so backup and export include samples; test round-trip. `saveState` allows only a fixed list of kinds and `POST /api/progress` passes client values to it, so `effortCalibration` must not be added to that generic path; only the dedicated confirm/clear operations write it. Older code could keep confirmations without invalidating them after actual edits, so revalidate confirmations against current actuals on read. Never restore an old database just to roll back code.

## Limits
- Effort samples, career feedback and worker logs stay private; tracked fixtures are fictional. No external reads or writes, Email, deployment or new runtime dependencies.
- Phase 5 stays NO-GO (#19). Workflow adoption (#21) and scheduled-refresh acceptance (#18) are separate requirements; completing Phase 6 tasks does not prove workflow efficiency.
