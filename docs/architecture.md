# Architecture

Node24, built-in SQLite/HTTP/filesystem, no third-party runtime dependencies.

Authorized source reads → private snapshot → Store.importSnapshot → SQLite → protected loopback API → routed views.
Immutable Q-number → explicit human chat approval → live conflict/duplicate recheck → external action → read-back receipt.
The external steps are an assistant workflow, not a server provider adapter. Daily refreshes never execute them.

- core.cjs: dates, classification, validation and source merge.
- phase2.cjs / approvals.cjs: fingerprints, immutable review versions and outcome rules; no credentials or provider writes.
- phase3.cjs: career identity, exclusions and eligibility uncertainty.
- store.cjs: authoritative private SQLite. Refresh preserves progress/receipts. Removed records are archived; recovery preserves newer external receipts and approval IDs.
- server.cjs / web/: loopback-only app, session/Origin/CSRF checks, escaped content and independent routes.
- routine.cjs: deterministic categories and bounded policy. Assistant orchestration supplies reads/metrics; code does not enforce browser read counts or dynamically switch models.
- db.cjs / approval.cjs / export-html.cjs: local operator interfaces and read-only fallback.
- app-server.cjs / serve.cjs / launcher.cjs: one app assembly point; plain start, or a supervising launcher that proves ownership, reserves the port before the Store opens and restarts only its own app process within a bounded budget ([launcher](launcher.md)).

Development uses separate synthetic data and port8768. Production uses an independent accepted checkout at8767 and external private data. Never copy ignored private files into task worktrees. Avoid simultaneous collection/execution of the same proposals; recheck current state before every approved action.

Code promotion changes a private manifest after acceptance, restarts the known service and verifies pages. Code rollback and database restore are separate operations. Schema-changing releases require migration/rollback assessment.
