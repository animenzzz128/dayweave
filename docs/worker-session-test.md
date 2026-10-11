# Worker session smoke test (quiet CLI)

Status: trial acceptance for [Quiet CLI sessions](agent-workflow.md#quiet-cli-sessions). It checks one thing: a request run from one human chat, with Claude workers in Herdr, adds no extra app sidebar tasks or projects. It is not an efficiency measurement. Only the user can observe the app; the coordinator never reports this test as passed on its behalf.

Keep screenshots, session IDs, logs and paths private and outside Git. Use synthetic data only.

## Setup
1. The user opens one fresh coordination chat in the existing Dayweave project. Do not register a new project for the task.
2. The coordinator assigns a unique request ID (for example `DW-SMOKE1`), creates its private result record and checkpoint, and verifies Git state and current owners. No other writer may own the target worktree.
3. Task: a tiny synthetic docs change on a new branch from a verified baseline (for example, one clarifying sentence in a docs file). It may be discarded after the test; publishing it needs the usual approval.

## Before
- **User:** refresh the app. Note the sidebar tasks per worktree group and the project list (private screenshot).
- **Coordinator:** record, privately, the names of the CLI's native session folders, the Herdr workspaces and panes, and the timestamps of any aggregate result or status page.
- **Preflight:** the installed `claude --help` lists `--no-session-persistence` and `--name`. If not, stop: the test is **blocked**. Do not run a persisted fallback.

## Run
1. Dispatch the writer as `{request-id}-writer1` in the request's Herdr workspace (explicit IDs, no focus). It edits, and the change is committed.
2. Dispatch an independent read-only review as `{request-id}-review1`, bound to the exact head SHA, in the reviewer pane. A second round, if needed, is `{request-id}-review2` in the same pane after confirming it is idle.
3. Recovery drill: try to dispatch the writer again as attempt 1. It must be refused (evidence exists). Confirm the checkpoint names the baseline and head SHA, the last completed step and the next attempt number.

## After
- **Coordinator:** for each run, the private evidence has prompt, events, stderr, result, exit marker, requested and observed model, and session ID. No native transcript file exists for any returned session ID, and no new native session folder appeared. The Herdr workspace has at most two task panes, each named for its role; no unrelated pane was closed. The aggregate record and status page are unchanged unless the root coordinator merged them.
- **User:** refresh the app, then quit and reopen it. Compare the sidebar and project list with the Before notes.

## Verdict
**Pass** only if all hold:
- The only new sidebar entry is the human coordination chat itself: no new tasks after refresh or reopen, and no new projects.
- Herdr panes are named per role, within the one-writer/one-reviewer bound.
- Evidence and recovery information are complete; the duplicate attempt was refused.
- No other request's result or the aggregate state was overwritten.

**Fail** if any worker or reviewer appears as an app task or project, or the app imports its events even though no native transcript exists. Report the observation with private evidence; do not describe it as success.

**Blocked** if the flag is unsupported or Herdr preflight fails.

## Limits
- No native transcript for a session ID shows only that this file is absent. It does not prove the app holds no other metadata about the run; the visible sidebar is the acceptance signal.
- The test observes writer and reviewer runs. Probe and quota-fallback runs use the same launcher and flag, but their sidebar effect is inferred until observed.
- One passing run supports adopting the setting for a trial. It does not show reduced quota use or faster delivery.
