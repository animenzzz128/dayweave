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
