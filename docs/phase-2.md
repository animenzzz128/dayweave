# Phase 2: approved calendar actions and assignment assistance

The dashboard prepares exact requests. The human sends a request in chat; an authorized assistant performs the live workflow. The static app has no calendar credentials or write endpoint.

## Calendar execution procedure

1. Test the Outlook connector identity. An administrator-consent screen means the connection is unavailable; do not bypass organization restrictions. Use an authorized signed-in Outlook browser session instead. Record connector and browser health separately.
2. Verify account, destination calendar, timezone, selected calendars, filters, all-day events and overflow. Read every affected occurrence, including other selected commitments. Mark coverage incomplete when any required view is unavailable. Never infer availability from an incomplete read.
3. Prepare create/update proposals with exact account, calendar, timezone, title, start/end, location, body, reminder, busy state, recurrence and no attendees. For updates, preserve all before fields and the remote event reference. Do not silently change room conflicts or course meetings.
4. Wait for explicit human chat approval of those exact fields. A checkbox, exported file, web page or copied request that was not sent by the human is not approval. Any material change requires a new review.
5. Re-read current state immediately before writing. Compare the before state for updates. Check all conflicts, the local action history, the event body marker `Dayweave action: ACTION_ID`, and matching title/times. Stop on a mismatch or ambiguity. Verify the timezone actually used by the editor, not just the display language.
6. Save approved edits to the private proposal record. Write a local `pending` journal entry **before** saving remotely. Add the action marker to the approved event body. Use a provider transaction ID when supported. Browser writes have no atomic exactly-once guarantee.
7. Create the personal event, or modify only the identified personal event. Disable online meetings, keep attendees empty, and set the approved reminder and busy state. No invitations, messages, other meetings or submissions.
8. Reopen the saved event and compare every approved field, including recurrence range and affected occurrences. Record `executed` only with a remote reference, timestamp and read-back evidence. If save/read-back is uncertain, record `unverified`; inspect the service before retrying. A `not_created` outcome requires positive evidence of absence before another attempt.
9. Refresh the private event snapshot and render. Calendar-write verification does not refresh coursework timestamps. Report successes and unresolved actions separately.

The first real write requires a concrete approved event; reaching the editor does not prove save permission. Unattended access is a separate validation.

## Data additions

Proposals retain the v1 shape and add `action` (`create` or `update`), `account`, optional `calendarId`, `timezone`, `location`, `body`, `busy`, `reminderMinutes`, and `attendees: []`. Updates additionally need `remoteRef`, `scope: "single"` and a complete `before` event. Matching snapshot events carry the same account/calendar, timezone and remote reference. Missing provider IDs can use an exact observed browser event link or unambiguous recorded reference; never guess an ID.

`calendarCoverage` adds `checkedAt`, `account` and `calendar`. Coverage is specific to that destination; evidence older than 26 hours cannot prepare requests, and the assistant must still re-read immediately before any write.

Recurrence is `"One time"` or `{ "frequency": "daily" | "weekly", "interval": 1, "count": 3 }`. Support is bounded to 2–30 occurrences and 90 days, preserving local clock times across DST. All occurrences must fit the verified window. Existing recurring series and attendee meetings cannot be modified in this increment. The collecting assistant supplies recurrence proposals; the dashboard edits their title and initial times.

An action journal record has `id`, the full semantic `fingerprint`, `status`, and `recordedAt`. Verified outcomes also require `verifiedAt`, `remoteRef` and `evidence`. Keep these records in private `data.json`, never Git.

```sh
# Set DAYWEAVE_DATA_DIR to your private runtime directory first if needed.
node scripts/record-action.cjs /private/receipt.json
npm run build
```

The command updates the local journal only; it neither authorizes nor performs remote actions. Preserve pending/unverified/executed records during refresh. Do not overwrite them with an older snapshot. One assistant should execute calendar requests at a time.

## Assignment assistance

Choose Request help on a specific assignment. Select outline, draft for review, review, or explanation; provide actual notes/materials and your argument. The generated request is editable through those inputs and stays local until pasted into chat. No long draft is generated automatically.

Set `assignment.assistance` to `{ "requiresNotes": true, "missingInputs": ["Actual class notes", "Your argument"] }` for personal classroom responses. These inputs are required before preparing a response request. Other assignments may list missing materials without blocking an explanation request.

The assistant reads the full current assignment, rubric, linked materials and course AI rules first. It asks for missing evidence before drafting and separates observed source facts, user input and assumptions. For personal classroom responses it supports outlining and review from actual notes; it must never invent participation or discussion. Respect instructions that prohibit editing a workbook or other artifact. Submission always remains with the user.

## Acceptance status

Automated checks cover exact destinations, stale/invalid coverage, recurrence/DST conflicts, target-specific update checks, semantic fingerprints, uncertain-save recovery and required classroom inputs. Browser acceptance must additionally verify request preparation, edit invalidation, reload persistence and help requests. Live connector/browser access, real approved saves and unattended execution depend on the installed account/session and must be reported independently.
