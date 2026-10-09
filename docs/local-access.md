# Local access troubleshooting

Portable diagnostics for reaching the local app, private repository pages and worker sessions. These are generic checks, not root causes of any particular incident. Launcher, manifest, data and log locations come from private operator configuration; never record them, account details or run state in Git.

## Classify the symptom first
| Symptom | Class | First checks |
| --- | --- | --- |
| Connection refused / "can't reach this page" on `127.0.0.1` | Usually no listener on that port (stopped/not started/exited service or wrong port); local networking can also reject connections | Is the known service running? Stable (8767) or development (8768) port? Launcher startup output? |
| `ERR_BLOCKED_BY_CLIENT` | The browser or an extension/policy blocked the request before it reached the server | Inspect the site-specific blocker and ask the user to review permissions for their own extensions. Do not bypass managed policies or a denied tool permission. The server may be healthy |
| Page loads but data is old, a source-health notice appears, or a source reports access denied | App reachable; snapshot is stale or collection failed | Check snapshot time and source-failure records; refresh through an authorized assistant. Never bypass administrator restrictions |

A loaded page does not prove fresh data. A refused connection does not prove data loss. Record which class was observed before changing anything.

## Stable app recovery
- Start stable only from the external pinned manifest (accepted revision, checkout and private data path). Do not switch branches in the stable checkout, run a worktree on the stable port, or point development at the private database to restore access. Branch switches are not deployments.
- Stop only the known service; never kill arbitrary Node processes.
- Verify the actual page in a browser: Home and affected routes, reload, console and visible content. A started process or HTTP 200 alone is not acceptance.
- If access is not restored, report the blocker: symptom, checks run with results, last known good state and what remains unknown. Do not claim recovery or a cause without evidence.

## Private GitHub links return 404
GitHub shows 404, not "access denied", for a private repository the current viewer cannot see. If the CLI can read the repository but the browser shows 404, the browser is probably signed out or signed in to a different account. Sign in with the authorized account (a separate browser profile helps). Never change repository visibility, create token-bearing URLs, or paste tokens into links to work around it.

## Scripts and launchers on Windows
- Opening Markdown or a script in a viewer or editor shows commands as text; it does not run them. Run commands deliberately from a terminal.
- If execution policy blocks a `.ps1` launcher, use a CMD launcher alternative when the operator setup provides one. Never weaken machine- or user-wide execution policy to get around the block.

## Herdr sessions and worker progress
- A named Herdr session keeps running on its server while a visible client attaches to it. Closing or detaching the client does not stop the session; reconnect to the same named session to see it again. Shutting down the server ends its sessions and workers.
- After a disconnect, check whether the session and worker still exist and inspect the worktree before any retry. Never start a second writer on the same worktree. Reconnect/restart behavior is still a trial check (#21); confirm exact commands with the installed Herdr help.
- A headless worker whose output is redirected to a log does not automatically show live progress in any pane. A quiet pane is not evidence that the worker hung or finished.
- When the user asks for visible execution, show scoped worker lifecycle and progress summaries in task panes. Raw logs stay private and outside Git; reference them instead of pasting them.
- Pane badges and status indicators are not completion proof. Completion is shown by worktree artifacts, recorded check results and the handoff.
