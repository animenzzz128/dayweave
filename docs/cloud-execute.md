# Calendar executor (approved Google Calendar writes)

> Since 2026-10-27 the hosted site writes approved versions itself ([direct writes](google-direct.md)). This executor remains as an alternative; no task is scheduled. Its first run stopped at `verify` because the Google Calendar connector had changed its create arguments (camelCase `summary`, `startTime`, …) and its event shape, so this profile needs updating before it is used again.

The owner approves an exact prepared version (Q-N) on the private instance's Review page. A Claude cloud task with the Google Calendar connector then writes it: it rereads the live calendar, records `pending`, calls the create tool once, reads the event back and records the result. The instance never holds Google write credentials; the connector does the write, and the instance checks and records every step.

```
owner (signed in)                 hosted instance                         executor task (cloud session)
  Review → Approve Q-N  ───────▶  owner_approvals (channel web, by)
                                  GET  /api/execute  ◀──────────────────  approved versions still open
                                  POST /api/execute/verify  ◀───────────  exact create arguments
                                                                          live re-read (connector)
                                  POST /api/execute/recheck|pending  ◀──  conflicts, duplicates; pending
                                                                          create_event once (connector)
                                                                          read the event back (connector)
                                  POST /api/execute/readback  ◀─────────  executed or unverified
```

## What changes and what does not

- The bridge rules in [google.md](google.md#approved-google-calendar-writes-root-procedure) all still apply: create-only personal events on the destination calendar, one create call per action, live re-read at most 15 minutes old, pending before the write, field-by-field read-back, reconcile instead of retry, and a new version for any retry after `not_created`.
- The approval is the owner's click on **Approve Q-N** while signed in (CSRF and Origin checked). The server records `{channel:"web", text:"Approve Q-N", at, by}` itself; the executor API never accepts approval evidence from its caller. A chat "Approve Q-N" with the CLI bridge still works for local databases.
- Approve is refused unless the version is `prepared`, all Google, and its request checks pass now. Editing a proposal, a coverage identity change or a restore invalidates an unstarted version and with it the approval. **Withdraw approval** works until the first `pending` receipt.
- The executor has its own secret, `DAYWEAVE_EXECUTE_SECRET`, which must differ from the ingest secret, so the read-only collector cannot record receipts. 60 executor calls per hour per address.

## Configuration (owner)

| Where | Name | Value |
| --- | --- | --- |
| Fly secrets | `DAYWEAVE_EXECUTE_SECRET` | Random, at least 32 characters, different from `DAYWEAVE_INGEST_SECRET`. Unset means the executor API always returns 401. |
| Claude cloud environment | `DAYWEAVE_INGEST_URL` | The instance origin (shared with collection). |
| Claude cloud environment | `DAYWEAVE_EXECUTE_SECRET` | The same executor secret. |

The executor task gets only the Google Calendar connector. Enabling it needs the owner's approval, and the first real write is watched by the owner.

## The executor task's instructions

> Run the Dayweave calendar executor in docs/cloud-execute.md ("Run steps"). Only create the events the instance returns from `pending`, each with exactly the printed arguments, once. Never edit or delete calendar events, never send invitations, and never retry a create. Stop and report on any identity change or error you cannot classify.

### Run steps

Files go in `.local/execute` (not committed).

1. `node scripts/cloud-execute.cjs context`. If it fails, stop. If `versions` is empty, report "nothing approved" and stop.
2. Check the Google Calendar connector's identity. If it is not `coverage.account`, stop and report.
3. Write `.local/execute/args.json` as `{"arguments":[…]}`: the top-level argument names the connected create tool declares (from its schema).
4. For each version: `node scripts/cloud-execute.cjs verify Q-N`. `go: false` → report its blockers and skip the version.
5. For each action whose `receipt` is null, in time order:
   1. Read every calendar in `coverage.calendars`, one at a time, from one hour before to one hour after the action, recurring events expanded, all pages. Write `live-<ACTION_ID>.json` as `{checkedAt, provider:"google", account, start, end, reads:[{calendarId, complete, events:[raw events]}]}` ([shape](google.md#approved-google-calendar-writes-root-procedure), step 3).
   2. `recheck Q-N ACTION_ID`. `go: false` → report the conflicts or duplicates and skip the action; never move it.
   3. `pending Q-N ACTION_ID`. On success it prints `write`: call the create tool **once** with exactly those arguments.
   4. Open the created event with the read tool on its calendar and write `readback-<ACTION_ID>.json` as `{calendarId, account, event}` (raw event). Then `readback Q-N ACTION_ID`.
   5. If the create call timed out, errored unclearly or returned no event, do not call it again. Read every coverage calendar from 24 hours before to 24 hours after the action into `search-<ACTION_ID>.json` (same shape as the live read) and run `reconcile Q-N ACTION_ID`.
6. For each action whose `receipt` is `pending` or `unverified` from an earlier run, only reconcile (step 5.5). Never create again.
7. Report per version: actions executed, unverified (with the differences), skipped (with the reason). No event descriptions or other calendar details in the report.

## Limits

- Create only. Moving or deleting a written block is done in Google Calendar by hand for now; the next collection reads the change.
- A run only happens at the task's scheduled times or when the owner starts it. Approved blocks whose time has passed fail the checks and are not written.
- The connector offers no client event ID or extended properties, so duplicate protection is the description marker, the serial pending receipt and reconciliation ([google.md](google.md#approved-google-calendar-writes-root-procedure)).
