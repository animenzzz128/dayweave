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
