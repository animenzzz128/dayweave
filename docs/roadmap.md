# Incremental roadmap

Current behavior/limits: project-state.md. Each outcome has its own acceptance and PR.

| Stage | Status | Outcome |
| --- | --- | --- |
| Phase1–3 | Implemented foundation | Coursework/calendar review, assignment help, career pipeline; collection remains assistant-driven. |
| Phase4 | Implemented | v1.5.0 milestone, SQLite/routes/history/Q versions/routine/eval; startup fix#10 merged. |
| Governance | Foundation implemented; operational acceptance pending | Durable docs/templates and isolated-runtime workflow are in place. Verify local setup privately and observe three independent scheduled refreshes (#18). |
| Phase5 | Feasibility assessed; executor NO-GO | [Issue #14 gate](outlook-feasibility.md): authorization and approval-to-executor channel unverified; retain chat approval. Re-gate under #19. Writer, reliable outcomes and improved collection remain future work. |
| Phase6 | Planned (milestone 1, #20) | Effort calibration, workload modes, career feedback ranking and weekly trends, as separate scoped PRs. |
| Agent workflow | Trial (#16 policy, #17 validator, #21 evaluation) | [Coordinator/CLI-worker delivery](agent-workflow.md); adoption is a user decision after measured pilots and a single-agent baseline. |

Phase5 sequence:
1. Demonstrate supported authorization/trigger channel, including admin restrictions and login expiry; decide go/no-go before implementing remote writer.
2. Exact version, fresh conflicts/duplicates, idempotency, ambiguous-save reconciliation and verified receipt.
3. Execution states and actionable recovery UX.
4. Permitted structured collection, reduced reads and measured coverage.
Keep chat approval if no reliable trigger exists. Email remains disabled until explicitly enabled; mobile/sync/hosting are separate future choices.

Observe initial routines for coverage, urgent omissions, submitted/optional errors, failures, reads, duration and available usage. Tokens unavailable remain null. Expand Luna eval with DST, moved deadlines and ambiguous receipts; archive scored responses only when captured. Do not promise fixed savings.
