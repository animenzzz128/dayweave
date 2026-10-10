# Task prompt (template)

Coordinator fills the braces. Policy: [agent-workflow.md](../agent-workflow.md).

```text
Task: {issue #, observable outcome}
Role/model: implementer or execution lead, claude-opus-5-5 high {or gpt-6-astra low / gpt-6.1-sol + recorded reason}
Publisher: {none | delegated for this request only: push {branch} and open/update its PR; never merge, release, tag, change visibility or deploy}
Baseline: {branch} at {full SHA}; verify clean before editing
Worktree/branch: {logical worktree key}, {branch}; you are the only writer
Read: AGENTS.md, docs/project-state.md, docs/agent-workflow.md, {module docs}
Scope: {in scope}. Out of scope: {exclusions}
Acceptance: {evidence}. UI: real scripts in page order, affected routes, reload, console
Data: synthetic fixtures and development port; no external writes
Return: handoff per agent-workflow.md (changes, checks actually run, unresolved, next step);
as execution lead, also update the private RESULT record per "Results and archive" (archive first).
Without a Publisher delegation, do not push; commit only if the coordinator asks. Never merge or deploy.
```
