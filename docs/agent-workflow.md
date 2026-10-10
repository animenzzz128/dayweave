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
| Planner, designer | `claude-opus-5-5`, high | All ordinary planning, blueprints and design |
| Implementer | `claude-opus-5-5`, high | Implementation, UI design, tests |
| Reviewer | `claude-opus-5-5`, high | Independent review of an exact SHA |
| Exceptional planner | `gpt-6-astra`, low ("Light") | Only when the root coordinator audits a task as exceptionally difficult or complex and records the reason before dispatch |
| Alternate | `gpt-6.1-sol`, low or medium | Only when the coordinator records the complexity or observed-usage reason |

- Astra is never the default planner. "Needs a plan" is not by itself a reason; the recorded reason names what makes the task exceptional.
- No Astra High escalation by default; it needs explicit user approval.
- Preserve the current top-level chat model unless the user changes it. Choosing a model for a CLI worker does not change the coordination chat.
- Record requested and observed model/effort per run. Unavailable observed values are `null` with a reason; runs with unknown configuration do not count as adoption evidence.

## Authority
The coordinator is the single driver for a user request.

- Continue every authorized, actionable task until it is PR-ready or blocked. Report blockers. Never silently expand scope; new scope becomes an issue or a question.
- The user has authorized CLI worker dispatch for scoped development. That does not authorize creating or messaging other app chats.
- Never merge, release, tag, change visibility or deploy unless the user asks for that action. Lifecycle steps in docs do not grant that authority.
- Existing external-action restrictions stand: no calendar writes, messages, email or assignment submission. Do not reboot the machine without authorization.
- Workers return results through artifacts (worktree changes and a handoff). Only the coordinator pushes branches and publishes PRs or comments; workers never push, except under [publisher delegation](#publisher-delegation) or by explicit coordinator-role transfer under [Quota handoff](#quota-handoff).

### Root coordinator and execution lead
The root coordinator owns intake, priorities, final review of results and the summary to the user. It may hand one approved request to a single execution lead (`claude-opus-5-5` high) that owns scoped planning, implementation, checks and the separate-context review cycle. The execution lead reports back; final acceptance stays with the root coordinator and the user.

### Publisher delegation
Only the root coordinator may delegate publishing, only to the execution lead, and only for one named request, by writing it into that request's dispatch prompt. A quota fallback coordinator cannot pass its push authority on. The delegate may then push that request's branch and open or update its PR. Nothing else changes:
- Never merge, release, tag, change visibility or deploy. No external writes.
- Required checks after staging, a privacy review of the staged diff and separate-context SHA-bound review still precede publishing.
- The delegation ends with the request. It does not pass to sub-workers or reviewers, and it does not cover other tasks.
- Workers without a written delegation still never push.

## Task lifecycle
1. One task = one owner, session, worktree, branch and PR, created from a verified baseline SHA. Synthetic data and the development port only.
2. Dispatch the writer with [prompts/task.md](prompts/task.md). The writer stays within scope.
3. After staging, run `npm run check`, `npm test`, `npm run demo` and `npm run privacy`, plus UI acceptance from AGENTS.md when UI changes. Record actual results with the subject SHA; never report checks that did not run.
4. Review in a separate context with [prompts/review.md](prompts/review.md), bound to the exact head SHA. A new commit invalidates that review. Maximum two review rounds; remaining findings go to the user with evidence.
5. The coordinator, or a delegated publisher, publishes the PR with the handoff. Merging happens only on user request.
6. Record the outcome as described in [Results and archive](#results-and-archive).

Run tasks concurrently only when independent: separate worktrees, data directories and ports, and no shared files.

## Herdr execution
- Herdr dispatch is available only when its preflight succeeds in the current session. If preflight fails, do not use Herdr for that task; report the failure.
- A failure report preserves resumable state: task, baseline/head SHA, branch and worktree status, last completed step and what is unknown.
- If a dispatch outcome is ambiguous (a worker may have started or written), inspect the worktree, branch and artifacts before retrying. Never start a second writer on the same worktree.
- Interruption, retry, stale review, reconnect and restart behavior are trial checks (#21), not assumptions.
- During user-requested visible execution, show worker lifecycle and progress summaries in task panes. Raw logs stay private and outside Git. Pane badges are not completion proof; use artifacts, check results and the handoff. See [local access](local-access.md#herdr-sessions-and-worker-progress).

## Results and archive
Every request ends with a private result record, kept outside Git.
- Always update the private `RESULT.md`. It is the authoritative record: request, status, owner, PR, exact head SHA, checks with their subject SHA, review verdict, blockers and the next user action.
- Before replacing `RESULT.md` or the private start prompt, archive the previous version as an immutable timestamped copy. Archive each completed request.
- Preserve original evidence. A repaired or reformatted copy is a separate derived file that names its source; never rewrite logs in place.
- An optional private static status page may summarize the record. It is derived from `RESULT.md`, shows the source timestamp and claims no live status.
- Launchers that capture CLI output set UTF-8 explicitly for stdin, console decoding and written files. Console defaults can silently turn non-ASCII output into mojibake. Keep this setting scoped to the launcher process, not machine policy.

## Quota handoff
The user has authorized handing in-progress authorized work to Claude Code `claude-opus-5-5` high when observed Codex quota runs low. This is policy only: no scheduler or always-on monitor implements it. One real handoff ran on 2026-10-09; the reset handshake and recovery checks remain unobserved (#21). The handoff transfers the coordinator role; it is separate from ordinary model routing, in which Claude executes all ordinary tasks.

**Measure.** The quota reading is account-shared rate-limit usage, not per-session credits.
- Per applicable Codex window (primary and secondary): `remaining = clamp(100 - usedPercent, 0, 100)`. Trigger when either is strictly below 10. Ignore unrelated reserve buckets and cash/credit balances.
- A missing or null value, or a reading older than 5 minutes or past its reset time, is **unknown**, never zero. Unknown does not trigger; re-observe at the next check point.
- Record value, window, source and observation time privately, never in Git.
- Check at request start, before substantial new dispatch, between tasks and before expensive checks; not on every tool call. Background monitoring is not guaranteed.

**At threshold.** Start no new GPT development.
1. Checkpoint privately: exact user scope and approval boundaries, source-of-truth docs, task list, branch, full baseline/head SHA, dirty files, checks and reviewed SHA, blocking approvals, next command, worktree and runtime locations.
2. Quiesce the writer and verify from the actual process and worktree that it stopped before transferring ownership. If a Claude task already owns the work, continue it; do not duplicate.
3. Preflight a Herdr-managed pane; if Herdr is unavailable, use a native terminal. Dispatch with [prompts/credit-handoff.md](prompts/credit-handoff.md).

**Fallback authority.** Claude becomes explicit fallback coordinator solely for approved pending scope. It may push and open scoped PRs as the user authorized; this coordinator-role transfer is one of the two exceptions to the worker no-push rule (the other is [publisher delegation](#publisher-delegation)). No merge, release, deploy, calendar, email, message or assignment actions. Separate-context SHA-bound review and mandatory checks still apply.
- Never share browser cookies or passwords; do not assume MCP or browser tools exist in Claude. Source work it cannot access is reported as a blocker.
- If Claude auth, quota or tools are unavailable, stop with a recoverable blocker.
- Never alter budget, billing, model authentication or machine policy.

**Visibility.** Results appear in the coordinator chat or the Claude/Herdr window, plus a local private `RESULT.md` and checkpoint path. The root app chat receives no CLI messages automatically, and replies cannot be promised after Codex quota is exhausted.

**Reset.** Do not start a second writer. Inspect the active Claude session and worktree first; ownership returns only by explicit handshake (Claude checkpoints and stops, the coordinator confirms).

**Synthetic acceptance cases.**
- Primary `usedPercent` 91 (remaining 9), secondary 40: trigger, checkpoint, hand off. `usedPercent` 105 clamps to remaining 0 and also triggers.
- Both windows at remaining exactly 10: no trigger.
- `usedPercent` null, a reading 6 minutes old, or one past its reset time: unknown; no trigger, not treated as zero; recorded as unknown.
- Quota resets while Claude owns the task: no second writer; inspect Claude, then handshake.

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

Phase5 NO-GO stays blocking for #19 unless evidence resolves it or the user explicitly re-scopes. Phase6 implementation waits until the user approves the concrete acceptance of each task (plan in PR #31, tasks #26–#29).

### Milestone acceptance
- User-approved Phase6 acceptance criteria.
- Three real dual-agent pilots plus a comparable single-agent baseline.
- Recovery checks: interruption, retry, stale review, reconnect, restart.
- Honest usage reporting and an explicit user adoption decision.

Until then, report "tools installed / synthetic smoke passed" separately from "real efficiency not proven".
