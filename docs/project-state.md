# Current project state

Updated2026-10-09. Verify Git/PR state before editing; this file is not live status.

- v1.5.0 preserves the first static-to-web-app milestone. The original tag is unchanged and still contains the startup bug; use main containing merged fix#10 (53cfa65) or a later verified commit.
- Implemented: routed summary Home/modules, SQLite, progress migration, current/history, backups, immutable Q-number batches, receipts, bounded routine policy, career pipeline and fictional Luna eval harness.
- Email is disabled. Explicit human chat approval precedes external writes. No autonomous Outlook executor exists.
- Collection/execution depend on authorized tools and available sessions. School administrator restrictions remain unresolved; never bypass them.
- Initial Luna evidence is only three fictional scenarios. Observe live accuracy/usage; shared quota is not a per-run bill.
- Startup-fix baseline:33 regression tests, syntax/demo/privacy checks, Home and six module browser checks. Counts may change; record actual PR results.

One coordination chat handles priorities and acceptance; a fresh coordination window starts from [prompts/new-request.md](prompts/new-request.md). Each development outcome gets its own task CLI session/worktree/branch/PR; create an app chat for a task only when the user requests it. GitHub holds active work; checked-in docs preserve decisions. Do not assume another chat's transcript is available.

Stable deployment uses an independent checkout pinned to an accepted SHA, port8767, and an external private database. Revision and paths live in an external deployment manifest. Development uses synthetic data and another port. Daily refresh reads the manifest, never a mutable development branch.

Governance documentation and task templates are in place. Verify machine-specific Project registration, automation status and deployment/rollback paths from private operator configuration; these are not tracked runtime state.

Phase5 feasibility (issue #14): [NO-GO for a remote executor](outlook-feasibility.md). Supported Graph authorization/notifications and desktop schedules are documented, but authorized account access and an approval-to-executor channel are unverified. Retain explicit chat approval; no writer, Email enablement or deployment. Independent routine observations remain separate acceptance work.

Agent workflow (issue #16): [trial coordinator/CLI-worker policy](agent-workflow.md) under milestone 1, "Phase 6 and verified Herdr dual-agent delivery". Not adopted; tools installed and synthetic smoke runs are not proof, and real efficiency is unproven until the pilots and single-agent baseline in #21.
- The local [handoff validator](handoff-contract.md) (#17) is merged trial tooling. It checks handoff structure only (routing, SHA binding, usage labels); it does not verify claims, run checks or prove adoption.
- [Local access troubleshooting](local-access.md) covers refused/blocked pages, private-link 404s, launcher blocks and Herdr session/worker visibility. It is portable guidance; reconnect/restart behavior is still a #21 trial check.
- [Quota handoff](agent-workflow.md#quota-handoff): Codex remaining strictly below 10% in any applicable window hands approved pending work to a Claude Code fallback coordinator, the only exception to the worker no-push rule; stale or missing readings are unknown, never zero. Policy only: no monitor implements it and no live handoff has been tested.

Phase6A effort calibration (#26): Settings shows a descriptive, user-reported median actual/estimate ratio from explicitly confirmed, frozen per-assignment samples, with "Insufficient data" below three samples and visible exclusions. Actual edits invalidate confirmations; nothing adjusts estimates or plans. See the [sample contract](data-contract.md#effort-calibration-samples-phase-6a-26). Weekly trends (#29) are not implemented.

Phase6B workload modes (#27): Home has an explicit, local Standard/Reduced focus mode, defaulting to Standard. Reduced lists overdue and 72-hour required work first and keeps other required and selectable work listed. Verification items, source failures/staleness and calendar coverage limits stay visible in both modes. Selectable work with unknown submission status stays selectable and is also listed for verification. Submitted/graded/excused work stays out of the focus lists even when its source failed, while that failure stays in the health warnings. Focus links for locally archived work open Coursework History. The mode is advisory: it changes no records, approvals or effort samples, infers no capacity from blank calendar time and schedules nothing. See the [mode contract](data-contract.md#workload-modes-phase-6b-27).

Phase6C career feedback ordering (#28): Career Roles and People each list items the user saved first ("Saved by you") and dismissed items last with Restore, otherwise in source order with stable ties. Only each item's own explicit status counts; nothing is inferred for other items and editorial scores are unused. Existing exclusions, eligibility gaps and unknowns, and source-failure retention are unchanged. See the [ordering contract](data-contract.md#career-feedback-ordering-phase-6c-28).

Next: observe three independent scheduled refreshes (#18) and first-week coverage, failures and available usage. Configuration alone is not unattended acceptance. Revisit the Phase5 gate (#19) only with permitted authorization, trigger and recovery evidence. Use the validator in real task handoffs and proceed with independent Phase6 tasks (#20); the user decides adoption after #21 evidence.

Update this file when behavior, limitations or priorities change. Do not append transcripts or duplicate the complete GitHub history.
