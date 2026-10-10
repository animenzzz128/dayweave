# Design decisions

| Date | Decision | Reason / revisit condition |
| --- | --- | --- |
| 2026-10-08 | Git and short docs preserve durable knowledge | Coordination chats can be replaced. |
| 2026-10-08 | One outcome per task/PR; sequential by default | Limit context and coordination overhead; independent parallel work uses worktrees. |
| 2026-10-08 | Stable runtime is a pinned independent checkout | Branch switches and unfinished edits cannot affect daily service. |
| 2026-10-08 | Private database/deployment/account config stay outside Git | Prepare repository for possible public release. |
| 2026-10-08 | Chat approves immutable Q versions | Web-triggered execution remains unverified. |
| 2026-10-08 | Deterministic deadline/status logic precedes Luna summaries | Raw-input trial made boundary/uncertainty errors; revisit using scored/live evidence. |
| 2026-10-08 | Actual browser startup/routes are acceptance checks | Node imports concealed global scope collision. |
| 2026-10-08 | Phase5 remote executor is NO-GO; retain exact Q-version chat approval | [Feasibility assessment](outlook-feasibility.md): provider support does not establish authorized account access, unattended reliability or trusted approval ingress. Revisit with permitted evidence and synthetic recovery/trigger acceptance; any live write needs separate exact-action approval. |
| 2026-10-09 | Trial coordinator/CLI-worker workflow with fixed model routing and SHA-bound review | [Agent workflow](agent-workflow.md): separate planning, writing and review contexts may reduce rework, but efficiency is unproven. Adopt only by user decision after #21 pilots versus a single-agent baseline; revisit routing on observed usage. |
| 2026-10-09 | Codex quota below 10% in any applicable window hands approved pending work to a Claude Code fallback coordinator | [Quota handoff](agent-workflow.md#quota-handoff): keeps authorized work moving without new authority; unknown readings never count as zero. Policy only, not a monitor; revisit after an observed real handoff or a change in quota reporting. |
| 2026-10-09 | Claude Opus 5.5 high is the default for all ordinary planning, design, implementation, tests and review; Astra only for audited exceptional tasks with a recorded reason; written per-request publisher delegation (push/PR only) | User routing change. Keeps the root coordinator on intake, review and summary, and gives one execution lead bounded authority without making workers publishers. No merge, release or deploy. Revisit with #21 usage and quality evidence. |
| 2026-10-09 | Every request updates a private RESULT record; previous versions are archived immutably; repairs are derived copies | A captured result was silently mis-encoded, and overwritten records leave no history. RESULT stays authoritative; any status page is derived and makes no live claims. |
| 2026-10-09 | Effort calibration counts only explicitly confirmed, server-frozen positive estimate/actual pairs; median, three-sample minimum, zero excluded; any actual edit invalidates | [Sample contract](data-contract.md#effort-calibration-samples-phase-6a-26): conservative, descriptive and reversible; a dedicated endpoint prevents forged pairs and read-time checks cover older code. Revisit threshold, weighting or automatic estimate use only with observed samples and a user decision. |

Record meaningful tradeoffs, reasons and revisit conditions; do not duplicate the activity log.
