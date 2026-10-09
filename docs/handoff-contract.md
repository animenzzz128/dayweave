# Handoff contract (version 1, trial)

Status: trial tooling for issue #17 under the [agent workflow](agent-workflow.md). It is not proof that the workflow is adopted or efficient.

A handoff is a small local JSON file describing one task result. `scripts/validate-handoff.cjs` checks its **structure** only. A valid file can still contain false, stale or private statements: the validator does not run or verify checks, inspect Git, confirm models, review privacy, or approve or block any external action. Those remain human and coordinator responsibilities.

```sh
npm run handoff:check                                   # validates examples/handoff.json
node scripts/validate-handoff.cjs path/to/handoff.json  # any local file
```

Exit code 0 means valid, 1 means unreadable, malformed or invalid, and 2 means wrong usage. Errors are listed as field paths such as `runs[1].observed_effort`. The CLI never prints file contents, parser messages or unusual key names. `require('./scripts/validate-handoff.cjs').validate(value)` returns the same messages as an array (empty means valid).

See [examples/handoff.json](../examples/handoff.json) for a fully fictional example.

## Shape
Every object has an exact key set: missing keys, unknown keys (at any depth), empty or whitespace-only strings and wrong types all fail. That keeps session IDs, raw logs and other runtime payloads out of extra fields. It cannot stop such data from being pasted into a permitted text field, so review handoffs before sharing them.

| Field | Rule |
| --- | --- |
| `version` | The number `1` |
| `task` | `issue` positive integer; `outcome` non-empty text |
| `git` | `baseline_sha`, `head_sha`: full 40-character lowercase hex; `branch` text; `pr` text or `null` |
| `runs[]` | At least one. `role`, `requested_model`, `requested_effort`, `observed_model`, `observed_effort`, `justification` (text or `null`); `observation_reason` only as described below |
| `checks[]` | At least one. `command` text; `result` `pass` or `fail`; `subject_sha`; `evidence` text |
| `review` | `reviewed_sha`; `round` `1` or `2`; `verdict` `pass` or `changes_requested` |
| `usage[]` | May be empty. `metric`, `value`, `unit`, `source`, `unavailable_reason` |
| `limitations[]` | May be empty. Non-empty text entries |

## Rules
- **Routing.** `gpt-6-astra` uses `low`; `claude-opus-5-5` uses `high`; `gpt-6.1-sol` uses `low` or `medium` and requires a non-empty `justification`. Roles are free text; the validator does not tie a role to a model.
- **Observed configuration.** Known observed values must equal the requested pair. If the configuration is unknown, both observed fields are `null` and `observation_reason` explains why. A half-known pair fails, and `observation_reason` is rejected when values are known. Unknown runs remain valid input but do not count as adoption evidence.
- **SHA binding.** Every `checks[].subject_sha` and `review.reviewed_sha` must equal `git.head_sha`. Evidence for another commit is stale; a new commit needs new checks and a new review.
- **Usage.** Metrics and units are fixed: `tokens`/`tokens`, `elapsed_seconds`/`seconds`, `list_price_estimate_usd`/`usd`, `billed_credits`/`credits`. An unmeasured value is `null` with `unavailable_reason` text and `source: null`. A measured value is a finite number ≥ 0 with `source` text and `unavailable_reason: null`. Only `billed_credits` may use, and must use, `source: "billing_record"`. A list-price estimate or shared quota delta is never a bill.

## Privacy
Tracked handoff examples are fictional: `example.com` URLs, repeated-character SHAs and `null` usage. Real handoffs, usage records, logs and account details stay local and untracked.
