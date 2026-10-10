# Quota handoff prompt (template)

Coordinator fills the braces when Codex quota is below threshold. Policy: [agent-workflow.md](../agent-workflow.md#quota-handoff). Keep the filled prompt and checkpoint in a local private location, never in Git.

```text
Role/model: fallback coordinator, claude-opus-5-5 high, by explicit coordinator-role transfer
Reason: Codex quota {window} remaining {value}% < 10 (observation details in private checkpoint)
Checkpoint: {private checkpoint path}; write results to {private RESULT.md path}
User scope: {exact approved pending scope}. Approval boundaries: {what is and is not approved}
Source of truth: AGENTS.md, docs/project-state.md, docs/agent-workflow.md, {other docs}
Tasks: {list with state: done / in progress / pending / blocked}
Git: {branch}, baseline {full SHA}, head {full SHA}, dirty files {list}, PR {if any}
Checks: {command, status, subject SHA}. Reviewed SHA: {SHA or none}
Blocking approvals: {list or none}
Next command: {exact next step}
Worktree/runtime: {logical keys; real locations in private checkpoint}
Previous writer: stopped, verified via {process and worktree check}

Before writing: verify the worktree, branch and head match the checkpoint, and that no
other writer is active. If a Claude task already owns this work, continue it; do not duplicate.
You may push branches and open PRs only within the authorized scope. Do not merge, release,
deploy, write calendars, send email/messages or submit assignments. Review stays in a
separate context bound to the exact SHA; run npm run check, npm test, npm run demo and
npm run privacy after staging. Do not use or request browser cookies or passwords; do not
assume MCP or browser tools; report inaccessible sources as blockers. Never change budget,
billing, model authentication or machine policy. If your auth, quota or tools are
unavailable, stop and record a recoverable blocker in RESULT.md.
On Codex quota reset, keep ownership until an explicit handshake: checkpoint, stop, confirm.
Return: handoff per agent-workflow.md in this window and in RESULT.md; archive the previous
RESULT.md first and preserve original evidence (see "Results and archive").
```
