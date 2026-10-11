# Development and coordination workflow

Read AGENTS.md and project-state.md; verify branch, dirty files, open PRs and accepted baseline. Read only relevant module documentation. Private operating configuration is supplied separately. Coordinator-dispatched work also follows the trial [agent workflow](agent-workflow.md), model routing and [prompts](prompts/). Start a fresh coordination window from [prompts/new-request.md](prompts/new-request.md).

## Task lifecycle
1. Define one observable outcome and acceptance in an issue or brief task. Phases group tasks; they are not giant implementation chats.
2. Start a task CLI session/branch from verified main (or an explicitly recorded dependency). Create an app chat only when the user requests it. Default one developer; independent concurrent tasks need separate worktrees/data/ports. VS Code opens the same task checkout. Avoid concurrent edits to the same files.
3. Implement within scope; preserve unknown facts and permissions.
4. Run required checks. UI changes load actual scripts in browser order and verify affected routes, reload/back, console and visible result. Integration changes cover failures and ambiguous outcomes.
5. Create a focused PR with evidence/limits. Merge only within human authorization. After each parent merge, reconcile dependent branches as described in [After a parent PR merges](#after-a-parent-pr-merges).
6. Update durable state/decisions when relevant. Deploy an accepted commit only after explicit approval; archive task chats when requested. Published milestone tags never move.

## Task prompt
```text
Task: issue and observable outcome
Baseline: branch/commit; verify before editing
Read: AGENTS.md, project-state.md, related module docs
Scope: requested changes; avoid unrelated refactoring
Acceptance: concrete success/failure/UI evidence
Deliver: focused PR, actual test results, limitations, concise handoff
Private data: synthetic fixtures; no external writes during build/test
```
Handoff: PR/commit, visible change, verification, unresolved issue and next action. Do not paste full logs into coordination chat. Fresh context alone does not prove accuracy or savings; track omissions/rework/reads/actual usage.

## After a parent PR merges
Stacked PRs need a reconciliation step after every parent merge, before the next merge. A squash merge creates a new commit whose tree can equal the parent branch while sharing none of its commits. Git then picks an older merge base and replays the parent's changes against the child's own copy of them, so a child that edited the same lines conflicts even though nothing new arrived. GitHub retargets the child PR to the merged parent's base. A child squash-merged into a non-default base also does not close its issue.

Handle one parent merge at a time, then pause before the next merge:
1. Fetch, then record the new base SHA/tree, the child head, the PR base ref and mergeability. Confirm no other writer holds the child worktree.
2. Bring the child branch up to its remote head with a fast-forward, keeping any commit the user merged into it. Never reset, rebase or force-push.
3. Preview with `git merge-tree --write-tree` and keep the conflicting paths and hunks before resolving. For each conflict, check whether the incoming blob already exists in the child's own history. If it does, the child's content is the resolution.
4. Merge the new base without fast-forward. Compare the result tree with the last approved child tree. Runtime paths (`src`, `scripts`, `test`, `evals`, `examples`, `package.json`) must keep identical object IDs; stop and report any unexplained difference.
5. Compare the PR's own range against the new base (for example with `git patch-id`): it should hold only the child's not-yet-merged work. Name any extra commits that appear only through duplicated pre-squash history.
6. Run the four required checks on the staged tree and again on the new head. Earlier reviews, CI and browser evidence stay bound to their original SHAs; the new SHA needs its own review.
7. Repeat for the next child, merging the reconciled parent rather than the original one.

## Development
Use the Codex app as the default coordination/task entry point and VS Code for inspection, manual editing and debugging. A task can also be owned by the IDE extension; choose one active owner per outcome rather than starting duplicate chats for the same work. Do not assume chat history transfers between clients.

A Git worktree is a separate working directory sharing repository history and branches. Open VS Code on the exact task worktree to inspect its changes; the main checkout will not show another worktree's uncommitted edits. Create a short task branch before committing from a detached worktree. A worktree does not isolate ports, databases or external actions: configure those separately. Never copy private ignored data into it. Commit/push and preserve the PR before archiving a completed task.

Set DAYWEAVE_DATA_DIR to a separate synthetic directory, migrate examples/snapshot.json with scripts/db.cjs, set PORT=8768 and run scripts/serve.cjs. Never use the production database for tests. Stop dev service when finished.

For refused or blocked local pages, stale data, private-link 404s, blocked launchers or invisible worker progress, see [local access troubleshooting](local-access.md).

## Stable promotion and rollback
Keep an external manifest with active code revision/path, previous revision/path and private data path. Prepare a clean independent clone at the accepted SHA, run checks, back up database, stop the known service, atomically update manifest, restart and verify Home/affected routes. Do not kill arbitrary Node processes.
Code rollback selects the previous accepted checkout and restarts. Do not automatically restore old data and erase newer progress. Database recovery needs a safety backup and receipt-preserving Store.restore. Schema changes require a migration/rollback plan.

Before declaring handoff complete, verify the active and previous checkout paths exist, their clean HEADs match full revisions in the private manifest, the launcher resolves that manifest, and the routine is enabled with the intended schedule. Record configuration verification separately from actual scheduled-run results and browser acceptance. Preparing rollback code does not authorize switching the live service.

## Minimal governance
Use issues/PRs first; add a board only when useful. Keep coordination, development and routine separate. A coordination chat is not required for the app to run. Review roadmap priorities periodically.
