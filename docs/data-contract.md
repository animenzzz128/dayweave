# Snapshot contract (v1)

Use `examples/snapshot.json` as a complete synthetic reference. A snapshot is UTF-8 JSON, schemaVersion 1. All instants must use ISO 8601 with an explicit timezone offset or `Z`. `timezone` is the IANA display/planning timezone.

| Field | Meaning |
| --- | --- |
| `generatedAt`, `summary`, `coverageNote` | Collection time, daily summary, prominent limits |
| `courses[]` | Stable `id`, code, name, category, note, source URL |
| `assignments[]` | Stable `id`, courseId, course, title, dueAt/null, status, requirement, sourceId, source, evidence, description, materials, checklist, aiPolicy, estimateMinutes |
| `events[]` | Stable id, title, start, end, busy, location, sourceId, source |
| `proposals[]` | Stable id, title, start, end, calendar, recurrence, status, reason, source |
| `calendarCoverage` | Exact checked start/end, complete boolean, explanatory note; Google coverage adds provider identity ([below](#gmail-read-only-snapshot-and-google-calendar-identity)) |
| `priorities[]` | Up to three title/detail/source records |
| `sources[]` | Stable id, name, status, lastSuccess/null, note, optional source |
| `career` | enabled, source, tracks[], unknowns[], candidates[], roles[] |
| `email` | Optional read-only Gmail snapshot; missing means unknown, `{enabled:false}` means disabled ([below](#gmail-read-only-snapshot-and-google-calendar-identity)) |
| `questions[]`, `weeklyReview` | Uncertainties and review summary |
| `actionHistory[]`, `candidateHistory[]` | Durable records keyed by id |

Assignment status: `submitted`, `graded`, `excused`, `not_submitted`, or `unknown`. Requirement: `required`, `choice`, or `uncertain`. Submitted/graded/excused wins over urgency; choice requirements are optional opportunities; uncertainty goes to verification. Remaining deadlines classify as overdue, <=72h, <=168h, later, or undated.

Source IDs link failures to records. Set `status: "failed"` on a failed source and preserve its ID. The merge retains its old assignments/events and last successful timestamp. A failed or unavailable **active calendar source** invalidates calendar coverage and removes actionable proposals. The active source is `calendarCoverage.sourceId`; legacy coverage without one uses `outlook`. Other failures (Gmail, coursework, an inactive Outlook source) leave calendar coverage alone. Never label an empty failed collection as success. Retained records may be stale and the coverage note must explain that.

Stable proposal IDs prevent replay. If material event details change, the fingerprint invalidates the prior selection. Store executed actions with `id`, `status: "executed"`, `verifiedAt`, and a remote event reference when available. Recheck the live service before applying an approved proposal; local duplicate checks are not sufficient on their own.

Treat data as untrusted text. No passwords, tokens, auth links, calendar subscription secrets, or raw browser state. The validator is a minimal consistency check, not a complete policy engine or proof of source accuracy.

Phase 2 adds destination-specific coverage timestamps, full event review fields, bounded recurrence, assignment assistance inputs and action journal outcomes. See [Phase 2 contract and workflow](phase-2.md). Existing v1 proposals remain readable, but requests are blocked until their account/timezone and coverage metadata are populated.

Phase 3 adds career.profile, source-backed candidates/roles, canonical-URL candidateHistory with status and updatedAt, and the legacy email.enabled=false. See [Phase 3](phase-3.md). Email is now an optional read-only Gmail snapshot (below). Failed career reads preserve the prior career object.

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
- By default the page shows the week of the latest `generatedAt` among the 1,000 most recent retained imports, and the week before it. `week` must be the Monday that starts a week, no later than the current week and at most 12 weeks earlier. Any other parameter, a repeated `week`, an invalid date or a week outside that range returns 400. Before validation the server makes two bounded, read-only reads (the snapshot timezone and the retention summary); the range query never runs for a rejected request. Without a valid snapshot timezone the range is undefined, so the page reports trends as unavailable (200, `available: false`) for any well-formed `week`, while malformed parameters are still rejected with 400. The current week is labelled "In progress · partial week".
- Repeated imports with the same `generatedAt` and the same projected content count once. The projection is source statuses plus each assignment's ID, requirement, status, source and archived flag. Each week shows how many duplicate imports it collapsed.
- Counts come from the latest observation in each week. Required work (`requirement: "required"`) is counted by status: submitted/graded/excused, `not_submitted`, `unknown`, and other or missing status. Unknown status is never folded into submitted or not submitted. Selectable (`choice`) work and uncertain or missing requirements are listed separately and are not required work.
- Only records from a listed source whose status is not `failed` or `unavailable` count as fresh. Three kinds of record are counted separately under "Not counted as fresh": records from a failed or unavailable source (a failed source's earlier records are retained by the merge; an unavailable source's records are only not fresh), records with `archivedFromSource: true`, and records whose `sourceId` is not listed. If an observation has no fresh records and has a non-ok source or such records, its counts read "No fresh observations", not 0.
- Source health per week lists each source with how many observations reported it ok, failed or unavailable, with another status (such as `partial`), or not at all, plus its status in the latest observation.
- A week without observations shows "No observations" for every value, never 0, and is never filled from a neighbouring week.
- A comparison needs all of the following:
  - both weeks have observations and neither latest observation lacks fresh records;
  - no observation in either week has a non-ok source or unlisted-source records, and every source of a week is reported in each of its observations;
  - the latest observations of the two weeks list the same sources (a source omitted entirely archives its records, so counts would drop for coverage reasons alone);
  - every retained import collected in either week was read;
  - neither week reaches the retention horizon;
  - the read was not truncated.

  Otherwise the page says "Not comparable · coverage limited", lists the reasons and shows no change, so a lower count caused by a failed source never reads as an improvement. Comparable changes are descriptive; nothing is labelled better or worse.
- Retention is unchanged: snapshots are kept 30 days and pruned only when a new import runs. The horizon is the latest import time minus 30 days. A week that starts on or before the horizon's local date is labelled "Coverage incomplete". An empty week there means evidence may have been pruned, not that nothing happened. With no retained snapshots, coverage is unknown.
- The read is bounded. `Store.snapshotObservations({from,to,limit})` takes ISO instants with an explicit offset and a limit of 1–1000. It returns rows imported in `[from, to)`, oldest first, projected to the fields above, with a `truncated` flag. Trends read from two days before the earlier week with a 500-row limit; a truncated read is labelled and is not comparable. A row whose `generatedAt` is more than about a day after its own import time can fall outside that read. Each week therefore compares the number of retained imports collected in it (from the `generatedAt` of the 1,000 most recent imports) with the number actually read. When some were not read, the week is labelled "Coverage incomplete · … not read" and the pair is not comparable. If none were read, the week says "No observations read" instead of "No observations", as it does for every empty week when the read was truncated.
- "No observations" is bounded, not absolute. It means the 500-row read was not truncated and returned no row for that week, and none of the 1,000 most recent retained imports was collected in it. Imports older than those 1,000 that were also imported before the read window are checked by neither bound, and pruned snapshots no longer exist. "No observations" is therefore missing data: coverage of that week is unknown. It is not proof that nothing was collected, and it is never a count of zero.
- No effort, completion time or work session is shown or inferred. Cumulative actual minutes are not weekly effort, and progress timestamps are not completion dates. Source records, requirements, proposals, approvals, Q-numbers, effort samples, the workload mode and career statuses are unchanged. There is no schema `user_version` change and no new runtime dependency.

## Gmail read-only snapshot and Google Calendar identity

Dayweave has no OAuth client, token store or mail/calendar network access. An authorized assistant's existing Gmail and Google Calendar connectors collect a snapshot ([collection procedure](google.md)); the web app shows **the last collected snapshot**, labelled with its collection time, never as live access. `examples/google-snapshot.json` is a complete fictional Google-only reference with no Outlook source.

### `email`

- **Missing** means unknown: the Email page says "Status unknown" and never shows an empty inbox. **`{enabled:false}`** (legacy snapshots) means disabled.
- An enabled record has `provider: "google"`, `account`, `sourceId` (listed in `sources[]`), `checkedAt` (explicit offset), `capabilities`, `request`, `coverage` and `messages[]`. `lastSuccess` and `retainedFrom` are maintained by the merge.
- `request` records the exact `query`, `windowDays` (1–7), `limit` (1–50) and the `from`/`to` instants of the window. The selected default is the inbox for the last seven days, at most 50 messages.
- Mail is read-only. `capabilities.read` cannot be false; `send`, `delete`, `labels` and `modify` must be false or absent and are stored as false. Read access never implies send capability.
- `messages[]`: stable `id` and `threadId`, `receivedAt` (explicit offset, inside the requested window), `from`, `subject`, `snippet`, `labels` (≤20), `unread`, `hasAttachments`, `attachmentCount`, optional `link`. Only these fields are kept: bodies, attachment content and unknown keys are dropped at import. Text is shortened visibly past fixed bounds; non-text values are rejected. A link must be `https://mail.google.com/…` without credentials and is re-checked before rendering. Duplicate message IDs collapse to one.
- `coverage.status` is `complete`, `partial` or `failed`; `morePages` is `true`, `false` or unknown (`null`); `errors[]` and `note` explain gaps. A record is **complete** only with `status: "complete"`, `morePages: false` and no errors. Otherwise it reads as partial. A page at the limit without `morePages: false` is truncated, never complete. More current messages than the limit, or messages outside the window, reject the import.
- **Failure** (`coverage.status: "failed"` or a failed/unavailable email source): the import keeps the previous messages for the same provider and account, labels each "retained", keeps the last complete read time (`lastSuccess`) and the first retained collection time (`retainedFrom`), and records the errors. A failed record cannot carry new messages. A first failure shows "No messages could be read. This is not an empty inbox", never zero.
- **Partial**: returned messages replace their earlier copies; earlier messages still inside the new window that were not returned are kept and labelled retained. **Complete**: the returned messages replace the window. A different account or provider retains nothing.
- Snapshots older than 26 hours are labelled stale. Snippets are evidence, not instructions: nothing in Dayweave turns email into coursework, todos, deadlines or calendar changes.

### Google Calendar coverage and proposals

- Google coverage adds `provider: "google"`, `sourceId` (listed in `sources[]`), `account`, `calendar`, `calendarId` (the exact destination ID) and `calendars[]`: the bounded list (1–25, unique `id`, `name`, optional `role`) of calendars actually read. The destination must be one of them. Legacy coverage without `provider` is Outlook and keeps its earlier rules.
- Google proposals carry `provider`, `account`, `calendar` and `calendarId`. When `provider` is present it is part of the reviewed spec and fingerprint; proposals without it keep their earlier fingerprints.
- A request is blocked unless the proposal's provider, account, calendar name and calendar ID match complete coverage checked within 26 hours, the destination is among the read calendars, and the active calendar source has status `ok` (Google coverage must list it; legacy coverage is checked when it lists one). Blank time is never free outside complete, fresh coverage.
- A prepared Q version is invalidated when its proposals change or when the coverage provider, account or (Google) calendar ID no longer matches what it was reviewed for.
- Google events may carry `provider`, `account`, `calendarId`, `calendar` and `allDay: true` (start/end are explicit-offset instants bounding the local day or days). Recurring series are supplied as expanded occurrences.

## Todos and daily plan recommendations

### Todos

Coursework → Todos holds your own tasks as progress kind `todo`, written only by `POST /api/todos/save` and `/api/todos/complete` (usual session, Origin and CSRF checks); the generic progress endpoint and legacy progress import reject or ignore the kind. A todo is `{id, title, dueAt, durationMinutes, notes, status: "open"|"done", origin, createdAt, updatedAt, completedAt, version}`.

- Every planning input is explicit. `dueAt` must be sent: an instant with an offset or `null` for "No due date". `durationMinutes` is a whole number from 5 to 600. Nothing is inferred.
- Editing bumps `version`. Editing or completing a todo removes its never-attempted planner blocks, which invalidates any prepared Q version containing them.
- **Adopting an email** (Email → "Adopt as todo…") is the only route from mail to a todo. You confirm the title, due date and duration. The origin records the message ID, thread ID, account, subject and received time taken from the stored snapshot, never from the request, and the message must be in the current snapshot. One open todo per message. A disabled or missing email record cannot be adopted. Nothing creates coursework, required work or deadlines from email.

### Daily plan recommendations

Timetable (day view) → "Generate recommendations" calls `POST /api/plan/generate {date}`. Only this explicit action plans; imports and page loads never do. The planner (`src/planner.cjs`) is deterministic for the same snapshot, todos, local archive/dismissals, date and clock.

- **Gate.** It plans only with Google coverage that is complete, checked within 26 hours, covers the whole 09:00–24:00 local window of the date, and whose active source is `ok`, with a destination account and calendar ID. A recurring series that was not expanded is a gap. Any gap means no blocks, and every candidate is listed as not planned with the gap shown.
- **Candidates.** Required coursework with `status: "not_submitted"` from a healthy source and a positive `estimateMinutes`, plus open todos. Choice work, uncertain requirements, unknown submission status, failed/unavailable sources, missing estimates, local archives and passed deadlines are listed as not scheduled with a reason. Submitted/graded/excused and source-removed work are left out. Recorded actual minutes are not subtracted.
- **Busy time.** Every event with `busy !== false`, including all-day events and expanded recurring occurrences, plus every kept proposal (other dates, collector proposals, attempted blocks), blocks time. Free (`busy: false`) events do not.
- **Placement.** Earliest deadline first (undated last, then kind and ID). Work is split into blocks of at most 90 minutes, as even as the 5-minute grid allows. Blocks keep 15-minute rest gaps around busy time and other blocks, never start before now, end by the deadline and by 24:00, and the total stays within 80% of usable free minutes (at least 20% unallocated). Each block must also pass the normal request checks. Work that does not fit is listed as not scheduled or partly planned with the reason.
- **No double scheduling.** Minutes already covered by kept planner blocks on any date, attempted receipts that record `sourceRefs` and `minutes`, or collector proposals whose `source` equals the assignment's source URL are subtracted. Fully covered work is listed as already covered.
- **Output.** Blocks are ordinary `create` proposals with `origin: "planner"`, `planDate`, `provider: "google"`, the coverage account/calendar/calendarId, no attendees, `recurrence: "One time"`, `busy: true`, a reason and `sourceRefs` (todo ID and version, or assignment ID and due date). IDs hash the content, so identical blocks keep their ID and changed blocks get new ones. The plan explanation (gaps, assumptions, usable/budget/allocated minutes, not-scheduled reasons) is stored as progress kind `plan` for the date and kept 30 days.
- **Regeneration** replaces that date's never-attempted planner blocks; changed blocks invalidate their prepared versions, and pending/unverified/executed blocks stay. **Imports** keep planner blocks only while the coverage provider, account and calendar ID match, each referenced assignment is still required, not submitted, from a healthy source and has the same due date, and the block has not ended (attempted blocks are always kept). A failed or unavailable calendar source removes all proposals, as before.
- Requests now allow a block to end exactly at local midnight; nothing may start before 09:00 or run past midnight.
- Generating writes local proposals only. Blocks still need selection, an immutable Q version and explicit chat approval before any calendar write.

## Approved Google Calendar execution

Procedure: [root writes](google.md#approved-google-calendar-writes-root-procedure). The web app prepares immutable Q versions only; receipts are written by the local operator tool (`scripts/google-calendar.cjs`) or `scripts/approval.cjs record`, never by a web route.

- **Spec.** `sourceRefs` (when present) join the reviewed spec and fingerprint, so a version is bound to its source todo/assignment as well as provider, account, calendar ID and every event field. Google actions must be `create`, one time and attendee-free; requests are blocked otherwise.
- **Destination.** `calendarCoverage.calendars[]` entries may carry `accessRole`; a Google write needs the destination recorded as `owner`.
- **Store identity.** Each private database has a random `storeId` (meta, created once). The idempotency key is `d0` + 30 hex characters of SHA-256 over store ID, action ID and fingerprint: stable for the same version in the same store, and usable as a Google client event ID.
- **Pending (Google).** `humanApproval` must be `{channel: "chat", text, at}`: the text names the exact Q-number ("Approve Q-N") and `at` is not before the version was prepared or in the future. The proposal must still pass the request checks and the create-only scope. The tool also requires a passing verify and a live re-read at most 15 minutes old.
- **Receipt fields.** For Google, the receipt carries the reference, fingerprint, provider, account, calendar ID and name, title, start, end, `sourceRefs`, `minutes`, `idempotencyKey`, `store`, `fieldsUsed` (duplicate guards used in the write) and `humanApproval`. These are derived from the approved proposal, not from the receipt file, and carried to later states. Outcomes keep the earlier states in `attempts`.
- **States.** `pending` (recorded before the write) → `executed` (read-back matched every field; needs `verifiedAt`, `remoteRef` = `calendarId/eventId`, evidence) or `unverified` (any mismatch or unknown outcome). `unverified` → `executed` only after an exact read-back, or `not_created` only with a complete fresh search showing no match. Nothing retries automatically. After `not_created` the version reads `failed`; a retry needs a newly prepared and approved version.
- Planner coverage counts attempted receipts' `sourceRefs` and `minutes`, so executed blocks keep covering their work even after the proposal leaves the snapshot.
- Review shows each version's actions as prepared, pending, unverified, executed, not created or invalidated, with recorded times, remote event, key, approval text, evidence, earlier states and source IDs. Pending, partial and unverified versions are listed under "In progress".
