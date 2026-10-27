# Direct Google Calendar writes (hosted instance)

Owner decision 2026-10-27: on the private instance, approving a version on the page writes it straight to Google Calendar. No scheduled task is involved. The site uses the owner's own Google consent and the Calendar API. It runs the same bridge checks as every other write path ([google.md](google.md#approved-google-calendar-writes-root-procedure), `src/google.cjs`).

```
owner (signed in)                         hosted instance                                Google
  Plan/Review → Connect Google Calendar  ─▶ /auth/calendar/connect ──── consent (calendar.events) ──▶
                                          ◀─ /auth/callback: refresh token sealed in google_tokens
  Approve Q-N and write  ─▶ owner_approvals ─▶ POST /api/calendar/write
                                            verify → live re-read (every coverage calendar, ±1 h) → recheck
                                            → pending → events.insert once (sendUpdates=none) → events.get → read-back
                                            unclear insert → reconcile from a ±24 h re-read; never retried
```

## Consent and storage

- Signing in still asks only for `openid email`. Calendar access is a separate consent. Only a signed-in owner can start it, from **Connect Google Calendar**. It asks for `https://www.googleapis.com/auth/calendar.events` with offline access. The connection is refused unless Google returns a refresh token that carries that scope.
- The refresh token is stored in the `google_tokens` table, one row per Google account, which is the multi-user shape. It is sealed with AES-256-GCM under a key derived (HKDF) from `DAYWEAVE_SESSION_SECRET` and bound to the account. Rotating the session secret makes the stored token unreadable, and the owner connects again. A restore keeps the current connection. Access tokens exist only in memory.
- **Disconnect** (`POST /api/calendar/disconnect`) revokes the token at Google and deletes the row. A refresh that Google rejects (`invalid_grant`), or a token without the scope, makes the page ask the owner to connect again.

## Rules (unchanged from the bridge)

- Writing is allowed only for owner-approved versions, and only to the destination calendar of the verified coverage. The connected account must equal `calendarCoverage.account`, otherwise nothing is written.
- Writes are create only. The insert body carries exactly the approved fields: title, description with the action marker, start and end, time zone, busy state, one popup reminder, and the default event type. It never includes attendees, a meeting link or recurrence, and invitations are never sent.
- Before each action the server re-reads every coverage calendar from one hour before to one hour after the block, with recurring events expanded and all pages. A conflict, a marked event or an unmarked look-alike skips that action. Skipped blocks are never moved.
- The server records `pending`, then makes one insert. A successful insert is read back field by field, giving `executed` or `unverified`. A failed, lost or unclear insert is reconciled from a ±24 hour re-read and is never retried. `not_created` needs a newly prepared and approved version.
- Only one write runs at a time per store. A version whose actions all have final receipts is reported again, not re-run.

## Owner setup (Google Cloud, once)

This uses the OAuth client that already handles sign-in. No new redirect URI and no new secret are needed.

1. Enable **Google Calendar API** in the project.
2. In Google Auth Platform → Data access, add the scope `https://www.googleapis.com/auth/calendar.events`.
3. Audience: the owner's account must be a test user. In Testing status (the current choice, 2026-10-27, because publishing asks for a privacy policy link), Google expires the refresh token after 7 days. The page then asks to connect again, which is one click. Publishing later removes the weekly reconnect.
4. Deploy, then click **Connect Google Calendar** on the Plan or Review page.

Before other people use the site, Google verification of the sensitive scope is required. That needs a privacy policy and the site's own domain. Until then, at most 100 users can use the app and each sees the warning.

## Relation to the cloud executor

The [cloud executor](cloud-execute.md) (`/api/execute`, Google Calendar connector) remains as an alternative, but no task is scheduled. Both paths record receipts through the same bridge, so a version is never written twice.
