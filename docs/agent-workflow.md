# Agent workflow (trial)

Status: trial policy for milestone 1 (issue #16). It is **not adopted**. Installed tools and synthetic smoke runs show the workflow can start; they do not prove real efficiency. Adoption is a user decision after the evidence in [Milestone acceptance](#milestone-acceptance).

This file, the [prompts](prompts/) and any skills are guidance. They are not a scheduler and not an enforced security boundary; repository rules, Git/GitHub permissions and explicit human approval remain the controls.

## Start a new coordination chat
1. Read AGENTS.md, [project-state.md](project-state.md), this file, [development-workflow.md](development-workflow.md), [roadmap.md](roadmap.md) and [decisions.md](decisions.md).
2. Verify live state: branch/HEAD, dirty files, active worktrees, open PRs and their head SHAs, milestone 1 issues. Docs are not live status.
3. Do not assume private tool paths, local configuration or earlier chat transcripts. Obtain machine-specific details from the operator or supported commands; never record them in Git.

Starting prompt: [prompts/new-request.md](prompts/new-request.md).

## Roles and model routing
| Role | Default model / effort | Use |
| --- | --- | --- |
| Planner | `gpt-6-astra`, low ("Light") | Blueprints, detailed plans, extremely complex analysis |
| Implementer | `claude-opus-5-5`, high | Routine implementation, UI design, tests |
| Reviewer | `claude-opus-5-5`, high | Independent review of an exact SHA |
| Alternate | `gpt-6.1-sol`, low or medium | Only when the coordinator records the complexity or observed-usage reason |

- No Astra High escalation by default; it needs explicit user approval.
- Preserve the current top-level chat model unless the user changes it. Choosing a model for a CLI worker does not change the coordination chat.
- Record requested and observed model/effort per run. Unavailable observed values are `null` with a reason; runs with unknown configuration do not count as adoption evidence.

## Authority
The coordinator is the single driver for a user request.

- Continue every authorized, actionable task until it is PR-ready or blocked. Report blockers. Never silently expand scope; new scope becomes an issue or a question.
- The user has authorized CLI worker dispatch for scoped development. That does not authorize creating or messaging other app chats.
- Never merge, release, tag, change visibility or deploy unless the user asks for that action. Lifecycle steps in docs do not grant that authority.
- Existing external-action restrictions stand: no calendar writes, messages, email or assignment submission. Do not reboot the machine without authorization.
- Workers return results through artifacts (worktree changes and a handoff). Only the coordinator pushes branches and publishes PRs or comments; workers never push.

## Task lifecycle
1. One task = one owner, session, worktree, branch and PR, created from a verified baseline SHA. Synthetic data and the development port only.
2. Dispatch the writer with [prompts/task.md](prompts/task.md). The writer stays within scope.
3. After staging, run `npm run check`, `npm test`, `npm run demo` and `npm run privacy`, plus UI acceptance from AGENTS.md when UI changes. Record actual results with the subject SHA; never report checks that did not run.
4. Review in a separate context with [prompts/review.md](prompts/review.md), bound to the exact head SHA. A new commit invalidates that review. Maximum two review rounds; remaining findings go to the user with evidence.
5. The coordinator publishes the PR with the handoff. Merging happens only on user request.

Run tasks concurrently only when independent: separate worktrees, data directories and ports, and no shared files.

## Herdr execution
- Herdr dispatch is available only when its preflight succeeds in the current session. If preflight fails, do not use Herdr for that task; report the failure.
- A failure report preserves resumable state: task, baseline/head SHA, branch and worktree status, last completed step and what is unknown.
- If a dispatch outcome is ambiguous (a worker may have started or written), inspect the worktree, branch and artifacts before retrying. Never start a second writer on the same worktree.
- Interruption, retry, stale review, reconnect and restart behavior are trial checks (#21), not assumptions.
- During user-requested visible execution, show worker lifecycle and progress summaries in task panes. Raw logs stay private and outside Git. Pane badges are not completion proof; use artifacts, check results and the handoff. See [local access](local-access.md#herdr-sessions-and-worker-progress).

## Handoff contract
Minimal portable fields; #17 implements validation, so this is not the schema.

- Task: issue and observable outcome.
- Git: full baseline and head SHA, branch, PR if any.
- Run: role, model, effort (requested and observed).
- Changes: files and visible behavior.
- Checks: command, status, evidence summary, subject SHA.
- Review: reviewed SHA, round, verdict, findings.
- Unresolved issues and limits.
- Next step.
- Usage (optional): value or `null`, unit and provenance.

Keep handoffs short; reference artifacts instead of pasting raw logs.

## Measurement and privacy
Per task, record human time, elapsed time, review findings judged true or false, rework rounds, failures and recoveries, reads where available, and usage.

- Unknown usage is `null` with a reason. Token quota deltas and API list-price estimates are not billed per-task credits; label them as such.
- Raw usage, session IDs, logs, account details and automation configuration stay local and private. Publish only sanitized evaluation conclusions.
- Tracked files contain no absolute machine paths, personal accounts or real usage records.

## Milestone 1
GitHub milestone 1: "Phase 6 and verified Herdr dual-agent delivery".

| Issue | Role |
| --- | --- |
| #1 | Earlier acceptance, still unresolved |
| #3, #5, #11, #14 | Completed foundations; keep their current states (#14: Phase5 executor NO-GO) |
| #16 | This workflow policy |
| #17 | Handoff validator pilot |
| #18 | Three scheduled-refresh observations |
| #19 | Phase5 authorization/recovery gate |
| #20 | Phase6 epic: effort calibration, workload modes, career feedback ranking, weekly trends |
| #21 | Measured efficiency, recovery and adoption decision |

Phase5 NO-GO stays blocking for #19 unless evidence resolves it or the user explicitly re-scopes. Independent Phase6 work can proceed.

### Milestone acceptance
- User-approved Phase6 acceptance criteria.
- Three real dual-agent pilots plus a comparable single-agent baseline.
- Recovery checks: interruption, retry, stale review, reconnect, restart.
- Honest usage reporting and an explicit user adoption decision.

Until then, report "tools installed / synthetic smoke passed" separately from "real efficiency not proven".
