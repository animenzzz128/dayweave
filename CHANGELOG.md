# Changelog

## Unreleased

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
