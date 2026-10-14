# Supervising launcher and operator check guide

`scripts/launcher.cjs` starts the local web app for one pinned checkout, makes sure only one verified owner runs it, and restarts a failed app process a bounded number of times. It has no dependencies and can be copied as a single file next to a private configuration. It is portable tooling: it does not change how the stable runtime is started until an operator separately adopts it, and it adds no scheduler.

## Configure
The launcher reads a JSON config (`--config <file>` or `DAYWEAVE_LAUNCHER_CONFIG`) and the deployment manifest it names. Relative paths resolve from the file that contains them. Unknown keys, wrong types and out-of-range values are rejected. Fictional examples: [examples/launcher/](../examples/launcher/).

| Config key | Meaning |
| --- | --- |
| `schemaVersion` | `1` |
| `manifestPath` | Deployment manifest: full 40-character `revision`, `codePath` (checkout), `dataPath` (private data directory) and `port`; other manifest keys are ignored |
| `port` | Expected port; must equal the manifest port |
| `stateDir` | Lock, state and control files. Must not be inside the data directory or the checkout |
| `logPath`, `fallbackLogPath` | Primary and optional fallback log; same placement rule |
| `gitExe` | Default `git` from `PATH`. A scheduled task may have a different `PATH`, so give an absolute path there |
| `requireCleanCheckout` | Default `true`: refuse tracked or untracked changes |
| `logMaxBytes` | Default 1 MiB per log; one `.1` generation is kept |
| `startupTimeoutMs`, `identityTimeoutMs`, `shutdownGraceMs` | Defaults 120000, 5000 and 10000 |
| `heartbeat` | `intervalMs` (30000) and `missLimit` (4) for the app-process liveness check |
| `restart` | `maxRestarts` (3) within `windowMs` (3600000), delays `backoffMs` ([5000, 30000, 120000]) |

## Commands and exit codes
```sh
node scripts/launcher.cjs start  --config <file> [--fallback-log <file>]
node scripts/launcher.cjs status --config <file>   # read-only: prints JSON, writes no files
node scripts/launcher.cjs stop   --config <file>   # asks a verified owner to stop itself
```
`--fallback-log` (or `DAYWEAVE_LAUNCHER_FALLBACK_LOG`) is used when the config cannot be read. The exit code is always one of these, so a scheduler's last result shows the outcome even when every log is lost:

| Code | Meaning |
| --- | --- |
| 0 | Stopped cleanly, a verified owner is already running (duplicate refused), or `status` found a verified owner |
| 1 | Unexpected internal error (recorded, lock released) |
| 2 | Usage error |
| 3 | `status`/`stop`: not running (no lock, or a stale lock whose owner is gone) |
| 10 | Config or manifest missing, malformed or invalid |
| 11 | Checkout unverifiable, HEAD differs from the manifest revision, or the checkout is dirty |
| 12 | Config, manifest, launcher or revision changed while running; restart refused |
| 20 | A verified owner runs with a different identity (revision, paths, port, config, manifest or launcher) |
| 21 | Ownership unknown: lock unreadable, holder unverifiable, a possibly live child, or a leftover recovery marker |
| 22 | Port occupied by an unverified listener, or the port probe was inconclusive |
| 23 | `stateDir`, lock or state file unusable |
| 30 / 31 | App-process startup / runtime failures exhausted the restart budget |

## Startup trust
- **Identity is a proof, not an observation.** The owner writes a lock in `stateDir` containing a random secret and listens on a local channel named from that lock (a named pipe on Windows, a socket file elsewhere). Another launcher challenges it with a fresh nonce; only a holder of the secret can answer. The answer's identity (launcher file hash, revision, checkout and data paths, port, config and manifest hashes) must equal what this launcher expects, otherwise it is a mismatch (20).
- **Never identity:** a PID (stale or reused), an HTTP 200, a page banner or a listener on the port. Any listener the launcher does not own makes it exit 22 without starting, contacting it beyond a connect probe, or terminating it.
- **Stale locks.** A lock is stale only when its owner channel is definitively absent (no pipe; on other systems no socket file, or one with no listener) and the child recorded for that owner has no beacon. A child keeps its beacon until its process has exited, also while it is still closing the Store, so a start in that interval exits 21 instead of opening the Store a second time. A recorded PID is not consulted. Anything else (a channel that answers without a valid proof, does not answer or denies access, a malformed lock, an unreadable state file, a possibly live child) is unknown and fails closed (21). Recovery takes a separate marker file, re-checks that the same lock is still stale, moves it to `stateDir/stale-locks/` without its secret (the newest 50 are kept), and then competes for a new lock like any launcher. A leftover marker blocks recovery until an operator inspects and removes it.
- **Trust boundary.** The secret protects against unrelated processes and stale state, not against code running as the same user with access to `stateDir`. This is a consistency guard, not authentication.

## Exclusive startup before data
1. Config, manifest and checkout are verified without writing anything.
2. The lock is created atomically (complete content, then a hard link; exclusive create where links are unsupported). Simultaneous launches therefore produce exactly one owner; the others verify it and exit 0, or exit 20/21.
3. Only the owner starts the app process. That process first creates its beacon, probes the port on 127.0.0.1 and ::1, reserves 127.0.0.1:port exclusively, and only then loads the app, which opens the Store. It serves on the reserved socket, so the port is never released in between. A connection that arrives while the Store opens waits and is then served; if that start fails, it is closed.

A losing or refused launcher never opens the Store and never writes to the data directory. The supervisor itself never touches the data directory.

## Diagnostics
Every message goes to the first writable sink: the primary log, `--fallback-log`, the config `fallbackLogPath`, then a per-user temp file named from the config path (`status` prints it). A sink that fails is noted once in the next sink that works. Messages are also mirrored to stderr, which a scheduler may discard. The handler that records fatal errors cannot throw, so an unwritable log never turns into a second crash.

## Recovery and its limits
- The app runs as a child process owned by the supervisor. A crash, a startup failure, a startup timeout or a missed heartbeat (the child is then terminated through its own process handle, before its exit was observed) counts as one failure. Within `restart.windowMs` at most `maxRestarts` restarts follow, with the configured delays; then the launcher exits 30 or 31.
- Before every restart the launcher re-reads config and manifest, re-verifies the checkout and probes the port. Any change, dirty checkout or occupied port stops recovery (12, 11 or 22) instead of retrying.
- A child that reports the port occupied is never retried (22).
- Every failure is kept in `stateDir/state.json` (newest 200 entries; the count of older dropped entries is kept) across restarts, relaunches and stale-lock recovery. `status` shows the last ten.
- If the supervisor itself dies, its child notices the closed IPC channel and stops itself (on Windows, synthetic tests observed Node ending it together with the supervisor); the next start recovers the stale lock once that child has exited. The supervisor's own crash is not restarted from inside; that depends on whatever started it.

## Shutdown boundaries
- `stop` contacts only a verified owner (also one with a mismatched identity, so an old revision can be retired) and asks it to stop itself. The owner asks its child to close, waits `shutdownGraceMs`, then terminates only that child's handle, records the exit and releases the lock. For an unknown owner `stop` exits 21 and sends nothing.
- Ctrl+C, a console close or a termination signal to the supervisor starts the same shutdown. A hard termination (for example a scheduler's "End" or a sign-out) skips it; the child then stops itself and the lock becomes stale.
- The launcher never signals any process it did not start, never retries when occupancy or identity is uncertain, and never deletes a lock it has not proven stale.

## Operator check guide
1. `status` exit 0 and `"owner": "verified"`, `child.state: "running"`: the configured revision is being served by the owner this config expects. Exit 3: not running. Exit 20: something else of ours is running; compare `differs`. Exit 21: inspect `reason` before doing anything; never delete the lock or kill processes to "fix" it.
2. After a start, read the newest lines of the primary log; if it is missing or unwritable, the fallback, then the temp file. Each line is `time level event {json}`.
3. Verify the page in a browser (Home and affected routes, reload, console). A verified owner and a listening child are not UI acceptance, and a responding page says nothing about data freshness.
4. Exit 22 means something else answers on the port. Identify it by your own means; the launcher deliberately does not.
5. Promotion or rollback: `stop` the verified owner, change the manifest, then `start`. Starting against a changed manifest while the old owner still runs exits 20 by design, and a crashed child of the old owner is not restarted under the new manifest (12).

## Scheduler configuration versus observed recovery
A scheduled task that runs `start` at sign-in, with "do not start a new instance" for overlaps, fits this launcher: duplicates exit 0 after verifying the owner. A scheduler's own restart-on-failure only re-runs the launcher after it exits non-zero (refusals and exhausted budgets); the launcher then re-verifies everything and refuses again rather than forcing anything. **Configuring such settings is not evidence that they work.** Real sign-in starts, sign-out, reboot, scheduler restarts and recovery of a real service have not been observed with this launcher; record them separately when observed.

## Not covered
- Tested with synthetic checkouts, data and ports on Windows (named pipes) and in the Linux CI job (socket files); macOS is untested.
- On other systems a socket file deleted from outside makes its live owner or child look absent. While that child listens its port reservation still prevents a second Store open, but not while it is closing.
- A hung supervisor (its channel accepts but never answers) blocks new starts as unknown (21) until a human acts.
- A listener that binds the port in the moment between the probe and the reservation is caught only if it takes 127.0.0.1 itself (the reservation then fails, exit 22). A wildcard listener started in that window is shadowed on loopback and not reported.
- One config per data directory: two different `stateDir`s pointing at the same data are not detected unless they also share the port.
- A revision without `src/app-server.cjs` is started as `attach(createServer())` from its `src/server.cjs` and `src/approvals.cjs`. That matches only revisions whose `serve.cjs` assembles the app this way; any other older revision is unsupported and may fail to load (exit 30 once the restart budget is spent) or start differently from its own `serve.cjs`.
