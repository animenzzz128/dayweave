# Review prompt (template)

Run in a separate context from the writer. Policy: [agent-workflow.md](../agent-workflow.md).

```text
Review only: {full head SHA} on {branch}; baseline {full SHA}; round {1|2}
Role/model: reviewer, claude-opus-5-5 high {or gpt-6.1-sol low/medium + recorded reason}
Session (Claude runs): read-only claude -p --no-session-persistence --name {request-id}-review{attempt}; not an app chat
Do not modify files, push or comment; review authority is read-only and never includes publishing.
Check: task acceptance, diff scope, check evidence bound to this SHA, privacy
(no personal data, absolute paths, accounts, session IDs, raw logs) and permission
boundaries (no merge, deploy or external writes).
Output: verdict, findings with file:line, evidence and severity (blocking/non-blocking),
what was not verified, observed model/effort.
A new commit invalidates this review. After round 2, remaining findings go to the user.
```
