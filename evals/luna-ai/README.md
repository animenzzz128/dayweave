# Luna AI evaluation

All records are fictional (the Luna demo). These cases test the three in-product AI tasks: the cited daily brief, assignment breakdowns and one-line proposals.

## What a case checks

Each case starts from `examples/luna-demo.json`, applies its `mutate` list (an outage, a moved deadline, an injected instruction in an email or assignment), builds the same evidence pack the site uses, and scores one model output in two layers:

1. **The site's validator** (`src/ai.cjs`): every sentence cites records that exist; numbers and times come from the cited records; no links or invented sources; no claim that anything was scheduled, sent or submitted; optional work is never required and unsubmitted work never submitted; every failed source is mentioned; breakdown quotes are copied from the assignment and never hand submitted work to AI; proposals have a valid day, time and length and cite the calendar coverage.
2. **The case's expectations** (`expect`): records that must be cited, wording that must appear (a moved deadline's new time), a total length range for steps, the right status for a sentence (`proposal`, `clarify` or `refuse`), the parsed day, time and length, and whether Dayweave's own phase2 rules should block the result.

A case passes only when both layers pass. The model is scored on its first attempt; the demo generator's single repair round is not used here.

## Run

- `npm test` runs `test/ai-eval.test.cjs`: every case builds, the scenarios change the evidence as described, and the scorer accepts good outputs and rejects bad ones. No network.
- `npm run eval:ai -- --runs 3` (with `ANTHROPIC_API_KEY` in the environment) calls the Claude API once per case per run and writes `results/<date>.json`: model, served model, prompt version, pass/fail per run, every failing output with its errors, and token usage. A result file contains only fictional data.

## Limits

21 cases on one fictional student is a regression set, not a measure of reliability on real data. Passing the validator means an output is grounded in its evidence, not that it is the best possible wording; a person still reads the prose. The demo's stored outputs are regenerated with `npm run ai:generate`, and the site re-validates them in the browser before showing them.
