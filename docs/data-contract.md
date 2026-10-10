# Snapshot contract (v1)

Use `examples/snapshot.json` as a complete synthetic reference. A snapshot is UTF-8 JSON, schemaVersion 1. All instants must use ISO 8601 with an explicit timezone offset or `Z`. `timezone` is the IANA display/planning timezone.

| Field | Meaning |
| --- | --- |
| `generatedAt`, `summary`, `coverageNote` | Collection time, daily summary, prominent limits |
| `courses[]` | Stable `id`, code, name, category, note, source URL |
| `assignments[]` | Stable `id`, courseId, course, title, dueAt/null, status, requirement, sourceId, source, evidence, description, materials, checklist, aiPolicy, estimateMinutes |
| `events[]` | Stable id, title, start, end, busy, location, sourceId, source |
| `proposals[]` | Stable id, title, start, end, calendar, recurrence, status, reason, source |
| `calendarCoverage` | Exact checked start/end, complete boolean, explanatory note |
| `priorities[]` | Up to three title/detail/source records |
| `sources[]` | Stable id, name, status, lastSuccess/null, note, optional source |
| `career` | enabled, source, tracks[], unknowns[], candidates[], roles[] |
| `questions[]`, `weeklyReview` | Uncertainties and review summary |
| `actionHistory[]`, `candidateHistory[]` | Durable records keyed by id |

Assignment status: `submitted`, `graded`, `excused`, `not_submitted`, or `unknown`. Requirement: `required`, `choice`, or `uncertain`. Submitted/graded/excused wins over urgency; choice requirements are optional opportunities; uncertainty goes to verification. Remaining deadlines classify as overdue, <=72h, <=168h, later, or undated.

Source IDs link failures to records. Set `status: "failed"` on a failed source and preserve its ID. The merge retains its old assignments/events and last successful timestamp. A failed `outlook` source invalidates calendar coverage and removes actionable proposals. Never label an empty failed collection as success. Retained records may be stale and the coverage note must explain that.

Stable proposal IDs prevent replay. If material event details change, the fingerprint invalidates the prior selection. Store executed actions with `id`, `status: "executed"`, `verifiedAt`, and a remote event reference when available. Recheck the live service before applying an approved proposal; local duplicate checks are not sufficient on their own.

Treat data as untrusted text. No passwords, tokens, auth links, calendar subscription secrets, or raw browser state. The validator is a minimal consistency check, not a complete policy engine or proof of source accuracy.

Phase 2 adds destination-specific coverage timestamps, full event review fields, bounded recurrence, assignment assistance inputs and action journal outcomes. See [Phase 2 contract and workflow](phase-2.md). Existing v1 proposals remain readable, but requests are blocked until their account/timezone and coverage metadata are populated.

Phase 3 adds career.profile, source-backed candidates/roles, canonical-URL candidateHistory with status and updatedAt, and email.enabled=false. See [Phase 3](phase-3.md). Failed career reads preserve the prior career object.

Phase 4 preserves v1 source input and adds a private SQLite authoritative store: current records, source snapshots, progress, immutable review batches, execution receipts, runs and paginated audit history. Source import cannot overwrite progress. Refer to phase-4.md.

## Effort calibration samples (Phase 6A, #26)

Actual minutes are local progress (`actual`, finite and ≥ 0). A missing actual stays missing: clearing the Coursework field deletes the value instead of writing 0. Recorded zero is valid progress but never a calibration sample.

A calibration sample is progress kind `effortCalibration`, keyed by the stable assignment ID: `{estimateMinutes, actualMinutes, requirement, confirmedAt}`. Only the dedicated confirm/clear operations (`POST /api/effort/confirm` and `/api/effort/clear` with `{id}`, under the usual session, Origin and CSRF checks) write it; the generic progress endpoint and legacy progress import reject or ignore the kind. Confirming reads the current stored assignment estimate and actual, requires both to be finite and positive, and sets `confirmedAt` on the server. Client-supplied pairs are ignored. Unknown assignments and malformed IDs are rejected. Required, selectable (`choice`) and uncertain work can each be confirmed. A confirmation records effort only; it never implies submission and changes no source estimate, status, proposal or approval.

- Any change to an assignment's actual minutes, including clearing it or restoring an earlier value, deletes that confirmation in the same transaction. The user reconfirms or clears explicitly.
- Source refreshes never rewrite a frozen pair; a source record that disappears (archived from source) keeps its sample, and Settings labels it as retained. Clear removes a sample.
- On read, a sample counts only while the current actual equals its frozen actual. This excludes confirmations left stale by code that predates this rule.
- Settings shows a descriptive, user-reported median of actual ÷ estimate. Fewer than three counted samples shows "Insufficient data" with the count. Exclusion counts cover unconfirmed actuals, zero actuals, actuals without a positive estimate, stale confirmations and malformed samples. Nothing adjusts estimates or plans.
- Samples are ordinary progress rows. JSON export includes them one way; there is no JSON import for samples. SQLite backup/restore round-trips them. No schema `user_version` change and no backfill of earlier actuals.

## Workload modes (Phase 6B, #27)

Home has an explicit, advisory focus mode: `standard` or `reduced`. It is stored as progress kind `preferences`, ID `workloadMode`, and written only by `POST /api/workload-mode` with `{mode}` under the usual session, Origin and CSRF checks. Any other value is rejected before a write. The generic progress endpoint and legacy progress import reject or ignore the kind. A missing or malformed stored value reads as `standard`, so older databases open in Standard. Source refreshes and restarts keep the preference. JSON export includes it, and restoring an older SQLite backup restores that backup's mode.

- Standard keeps the original Home overview.
- Reduced lists required work that is overdue or due within 72 hours first, ordered by deadline and then stable ID. Other required work (later or undated) and selectable (`choice`) work stay listed and labelled, and Coursework is unchanged.
- Focus lists apply this precedence; the first match wins:
  1. Submitted, graded or excused work is left out of every focus list and never returns to urgent, even when its source failed or is unavailable. That source's failure still shows in the data-health warnings in both modes, and Coursework History still tags the record `verify`.
  2. Other work from a failed or unavailable source goes to verification.
  3. Selectable (`choice`) work is listed as selectable and is never urgent or required. If its submission status is unknown, it keeps that listing with a "Submission status unknown" tag and is also listed in verification.
  4. Uncertain requirements, unknown submission status and a missing requirement go to verification, not to a definite category.
  5. Remaining required work is urgent (overdue or due within 72 hours) or other required work.
- Work archived locally in Coursework stays in the focus lists, tagged "Archived locally". Its link opens Coursework History, where the record is listed. Following the link changes no archive state.
- Both modes always show verification items, non-ok sources, a stale snapshot and calendar coverage limits. Blank calendar time is never treated as free capacity.
- Switching changes only the preference row and an audit entry. It changes no source records, estimates, proposals, approvals, Q-numbers or effort samples, and it never authorizes calendar, message or submission actions. Nothing is scheduled automatically.

## Career feedback ordering (Phase 6C, #28)

The Career Roles and People tabs order each list by the user's explicit status on that item, keyed by the item's canonical URL (or stable ID without one). The status is the latest `career` progress or `candidateHistory` record, as before. No new progress kind, endpoint or schema change.

- `saved` items come first and show "Saved by you". `dismissed` items come last, stay visible with Restore, and show "Dismissed by you". Every other status (including restored, `reset`) keeps the source order. Ties keep source order, so with no feedback both lists match the source order exactly.
- Roles and People are ordered separately. Follow-ups and History keep their existing order.
- Existing exclusions stay: applied roles; pending, connected and contacted people; source-removed people; and source-removed roles unless saved. A saved role removed from the source stays first and is labelled "Removed from latest source; retained". Dismissed items no longer leave Roles/People, and they also stay listed in History.
- Only each item's own status counts. Nothing is learned or inferred for other roles or people, editorial scores are not used, and no model is trained.
- Ordering changes presentation only. Source records, evidence, requirements, eligibility gaps and unknowns, relationships, proposals, approvals, effort samples and the workload mode are unchanged. Saving never makes unknown eligibility eligible.
- Eligibility checks are unchanged and skip what the profile cannot support: with no `usSponsorshipRequired` (or no profile) there is no US sponsorship gap, and when neither role nor profile has a `startYear` there is no start-year gap. The Career page labels these instead. Roles shows a "Profile facts missing: … — eligibility for these is not assessed and is not shown as eligible" banner when the profile is missing, null or lacks `usSponsorshipRequired`, `startYear` or `workEligibility`. Affected role cards show "Eligibility not fully assessed" and name each unassessed check on the eligibility line. This applies to US roles without confirmed sponsorship, and to roles where neither role nor profile states a start year. These labels never mean eligible. Saved/dismissed/reset does not change them, and they do not appear with a complete profile. The legacy static page does not show them.
- Source refreshes and failed career sources keep each item's state: the baseline is the current (or retained) source order, and the user's status follows the canonical URL.

## Weekly evidence trends (Phase 6D, #29)

Settings → Weekly trends compares two explicitly dated weeks from retained source snapshots. It is read-only: `GET /api/trends` (optional `week`) runs under the usual local session checks, writes nothing, and has no write route.

- An observation is one retained `source_snapshots` row (the merged snapshot stored at import). It belongs to the week of its source `generatedAt` (collection time) in the current snapshot `timezone`. Weeks run Monday 00:00 to Sunday 24:00 local time. Boundaries are calendar dates, so DST changes cannot shift them. Import time (`importedAt`, the row's `at`) is shown separately and never used for bucketing. Rows recorded with another timezone are still placed by the current one and noted.
- By default the page shows the week of the latest `generatedAt` among the 1,000 most recent retained imports, and the week before it. `week` must be the Monday that starts a week, no later than the current week and at most 12 weeks earlier. Any other parameter, a repeated `week` or an invalid date returns 400 before anything is read. The current week is labelled "In progress · partial week".
- Repeated imports with the same `generatedAt` and the same projected content count once. The projection is source statuses plus each assignment's ID, requirement, status, source and archived flag. Each week shows how many duplicate imports it collapsed.
- Counts come from the latest observation in each week. Required work (`requirement: "required"`) is counted by status: submitted/graded/excused, `not_submitted`, `unknown`, and other or missing status. Unknown status is never folded into submitted or not submitted. Selectable (`choice`) work and uncertain or missing requirements are listed separately and are not required work.
- Only records from a listed source whose status is not `failed` or `unavailable` count as fresh. Three kinds of record are counted separately under "Not counted as fresh": records from a failed or unavailable source (retained by the merge), records with `archivedFromSource: true`, and records whose `sourceId` is not listed. If an observation has no fresh records and has a non-ok source or such records, its counts read "No fresh observations", not 0.
- Source health per week lists each source with how many observations reported it ok, failed or unavailable, with another status (such as `partial`), or not at all, plus its status in the latest observation.
- A week without observations shows "No observations" for every value, never 0, and is never filled from a neighbouring week.
- A comparison needs all of the following:
  - both weeks have observations and neither latest observation lacks fresh records;
  - no observation in either week has a non-ok source or unlisted-source records;
  - neither week reaches the retention horizon;
  - the read was not truncated.

  Otherwise the page says "Not comparable · coverage limited", lists the reasons and shows no change, so a lower count caused by a failed source never reads as an improvement. Comparable changes are descriptive; nothing is labelled better or worse.
- Retention is unchanged: snapshots are kept 30 days and pruned only when a new import runs. The horizon is the latest import time minus 30 days. A week that starts on or before the horizon's local date is labelled "Coverage incomplete". An empty week there means evidence may have been pruned, not that nothing happened. With no retained snapshots, coverage is unknown.
- The read is bounded. `Store.snapshotObservations({from,to,limit})` takes ISO instants with an explicit offset and a limit of 1–1000. It returns rows imported in `[from, to)`, oldest first, projected to the fields above, with a `truncated` flag. Trends read from two days before the earlier week with a 500-row limit; a truncated read is labelled and is not comparable. A row whose `generatedAt` is more than a day after its own import time can fall outside that read.
- No effort, completion time or work session is shown or inferred. Cumulative actual minutes are not weekly effort, and progress timestamps are not completion dates. Source records, requirements, proposals, approvals, Q-numbers, effort samples, the workload mode and career statuses are unchanged. There is no schema `user_version` change and no new runtime dependency.
