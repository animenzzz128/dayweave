# Development and coordination workflow

Read AGENTS.md and project-state.md; verify branch, dirty files, open PRs and accepted baseline. Read only relevant module documentation. Private operating configuration is supplied separately.

## Task lifecycle
1. Define one observable outcome and acceptance in an issue or brief task. Phases group tasks; they are not giant implementation chats.
2. Open a task chat/branch from verified main. Default one developer; independent concurrent tasks need separate worktrees/data/ports. VS Code opens the same task checkout. Avoid concurrent edits to the same files.
3. Implement within scope; preserve unknown facts and permissions.
4. Run required checks. UI changes load actual scripts in browser order and verify affected routes, reload/back, console and visible result. Integration changes cover failures and ambiguous outcomes.
5. Create a focused PR with evidence/limits. Merge only within human authorization. After squash merges reconcile dependent branches and verify the final tree.
6. Update durable state/decisions when relevant, deploy an accepted commit, then archive completed task chats. Published milestone tags never move.

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

## Development
Set DAYWEAVE_DATA_DIR to a separate synthetic directory, migrate examples/snapshot.json with scripts/db.cjs, set PORT=8768 and run scripts/serve.cjs. Never use the production database for tests. Stop dev service when finished.

## Stable promotion and rollback
Keep an external manifest with active code revision/path, previous revision/path and private data path. Prepare a clean independent clone at the accepted SHA, run checks, back up database, stop the known service, atomically update manifest, restart and verify Home/affected routes. Do not kill arbitrary Node processes.
Code rollback selects the previous accepted checkout and restarts. Do not automatically restore old data and erase newer progress. Database recovery needs a safety backup and receipt-preserving Store.restore. Schema changes require a migration/rollback plan.

## Minimal governance
Use issues/PRs first; add a board only when useful. Keep coordination, development and routine separate. A coordination chat is not required for the app to run. Review roadmap priorities periodically.
