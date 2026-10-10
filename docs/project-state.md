# Current project state

Updated2026-10-10. Verify Git/PR state before editing; this file is not live status.

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
- [Quota handoff](agent-workflow.md#quota-handoff): Codex remaining strictly below 10% in any applicable window hands approved pending work to a Claude Code fallback coordinator; stale or missing readings are unknown, never zero. Policy only: no monitor implements it. One real handoff ran on 2026-10-09, but its reset handshake has not been observed.
- Routing (user decision 2026-10-09): `claude-opus-5-5` high handles all ordinary planning, design, implementation, tests and review. `gpt-6-astra` is used only for tasks the root coordinator audits as exceptionally difficult, with a recorded reason. The root coordinator owns intake, review and summary; a scoped execution lead may receive written [publisher delegation](agent-workflow.md#publisher-delegation) for one request (push and PR only).
- Every request updates a private RESULT record and archives the previous one ([Results and archive](agent-workflow.md#results-and-archive)). Private records and status pages are not tracked.

Phase6 (#20): the user approved the concrete acceptance of #26–#29 with the defaults in the [plan](phase-6-plan.md#approved-acceptance). Implementation is delivered as stacked dependent PRs (#26→#27→#28→#29), each merged only on user request; none is deployed, and completing them does not prove workflow adoption (#21). The paragraphs below describe only behavior present in this revision.

Phase6A effort calibration (#26): Settings shows a descriptive, user-reported median actual/estimate ratio from explicitly confirmed, frozen per-assignment samples, with "Insufficient data" below three samples and visible exclusions. Actual edits invalidate confirmations; nothing adjusts estimates or plans. See the [sample contract](data-contract.md#effort-calibration-samples-phase-6a-26). Workload modes, feedback ordering and weekly trends (#27–29) are not implemented.

Next: observe three independent scheduled refreshes (#18) and first-week coverage, failures and available usage. Configuration alone is not unattended acceptance. Revisit the Phase5 gate (#19) only with permitted authorization, trigger and recovery evidence. Use the validator in real task handoffs. Phase6 PRs (#20) are reviewed and merged in stack order only on user request; the user decides adoption after #21 evidence.

Update this file when behavior, limitations or priorities change. Do not append transcripts or duplicate the complete GitHub history.
