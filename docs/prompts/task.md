# Task prompt (template)

Coordinator fills the braces. Policy: [agent-workflow.md](../agent-workflow.md).

```text
Task: {issue #, observable outcome}
Role/model: implementer, claude-opus-5-5 high {or alternative + recorded reason}
Baseline: {branch} at {full SHA}; verify clean before editing
Worktree/branch: {logical worktree key}, {branch}; you are the only writer
Read: AGENTS.md, docs/project-state.md, docs/agent-workflow.md, {module docs}
Scope: {in scope}. Out of scope: {exclusions}
Acceptance: {evidence}. UI: real scripts in page order, affected routes, reload, console
Data: synthetic fixtures and development port; no external writes
Return: handoff per agent-workflow.md (changes, checks actually run, unresolved, next step).
Do not push, merge or deploy; commit only if the coordinator asks.
```
