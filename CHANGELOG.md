# Changelog

## 1.5.5 — 2026-10-11

Phase 6 initial completion (#20): the four approved Phase 6 features (#26–#29). Every change is local, advisory and reversible. No schema `user_version` change and no new runtime dependency. See the [Phase 6 acceptance guide](docs/phase-6-acceptance.md).

Released on 2026-10-11 as tag v1.5.5 at the reviewed commit 2ab5e0b, which contains all four features. The tag never moves; later revisions that keep version 1.5.5 are not the tagged release. The version and tag do not mean every feature is merged to main or deployed. As of 2026-10-11 after the release, #26 (PR33), #27 with #28 (PR34, which carried the PR35 squash of #28) and #29 (PR36) are merged into main and issues #26–#29 are closed, while the version and documentation update (PR37) remains open.

- Effort calibration (#26): Coursework records actual minutes (blank means not recorded, not 0) and explicitly confirms per-assignment effort samples. Settings shows a descriptive median actual/estimate ratio from at least three confirmed samples, otherwise "Insufficient data". Zero actuals are excluded and editing actual minutes removes the confirmation. Nothing adjusts estimates or plans.
- Workload modes (#27): Home has a Standard (default) / Reduced focus mode. Reduced lists overdue and 72-hour required work first and keeps other required work, selectable work, verification items, source health and calendar coverage limits visible.
- Career feedback ordering (#28): Career Roles and People list saved items first and dismissed items last with Restore, otherwise in source order. Profile facts that eligibility cannot assess are labelled "not assessed", never eligible.
- Weekly evidence trends (#29): Settings → Weekly trends compares two dated Monday–Sunday weeks in the snapshot timezone from retained snapshots, by collection time with import time shown separately. It shows required-work counts by status and per-source health, says "No observations" instead of 0, and shows no change when coverage is limited.
- Documentation: Phase 6 acceptance guide, post-merge reconciliation steps for dependent branches, and a corrected statement of the bounded weekly-trends read.

### Not in this release

- Not a deployment. The stable runtime keeps its separately pinned revision until an explicit promotion.
- The coordinator/worker workflow is still a trial (#21), and scheduled-refresh acceptance (#18) is separate. Phase 5 remote execution stays NO-GO (#19).
- Collection is still assistant-driven, Email stays disabled, and calendar or submission actions still need explicit chat approval.

## 1.5.0 — 2026-10-08

First static-dashboard to local-web-app milestone.

- Separate summary Home and routed module pages with current/history views.
- Node24 SQLite storage, durable progress, migration, paginated audit and 30-day backups.
- Immutable Q-number review batches, changed-version invalidation and verified outcome tracking.
- Bounded standalone routine policy, twice-weekly research and observed usage records.
- Fictional Luna routine evaluation cases, prompt generator, strict scorer and regression tests.
- Read-only HTML fallback; external calendar execution still requires explicit chat approval.

### Earlier unreleased improvements

- Exact calendar action requests, bounded recurrence with DST checks, single personal-event updates and a pending/verified action journal.
- Assignment help dialog with saved user notes, requested help mode and safeguards for personal classroom responses.
- Stronger invalid-date checks and durable execution-history preservation.
- Account-dependent live save/read-back and unattended execution remain acceptance steps.

## 1.0.0 — 2026-10-07

Initial reusable release of Dayweave.

### Added

- Self-contained local dashboard with coursework, priorities, timetable, review queue, career/email extension sections, and source health.
- Editable one-time calendar proposals and explicit chat approval-request generation.
- Submission-aware assignment classification, timezone-aware dates, overlap checks, duplicate-action protection, and stale-data notices.
- Failed-source snapshot preservation and 30-day local snapshot retention.
- Synthetic demo, isolated runtime data directory, local preview server, tests, CI, privacy guard, and reusable operating instructions.

### Known limitations

- Refresh orchestration and authenticated reads are supplied by an external assistant.
- Career discovery and email triage are not enabled implementations yet.
- V1 sleep/refresh defaults are fixed; account authentication, configurable routines, and unattended reliability need further work.

## Unreleased — Phase 3
- Career profile, evidence cards, eligibility warnings, local status controls and draft requests.
- Whitelisted career progress import, canonical profile deduplication and seven-day summary.
- Retain career data on refresh failure. Email stays disabled.

## Unreleased — Phase 4
- Bounded routine policy and observed metrics.
- SQLite migration, persistent progress, backups and loopback API.
- Routed summary-first workbench and paginated module history.
- Immutable Q-number review and verified local receipt workflow.
