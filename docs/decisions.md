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

Record meaningful tradeoffs, reasons and revisit conditions; do not duplicate the activity log.
