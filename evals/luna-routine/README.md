# Luna routine evaluation

All records are fictional. No accounts, network access, private files, or external writes are needed. This is a three-case regression set, not evidence of reliable unattended browsing or a measured cost saving.

## Run

1. Run `node --test test/routine-eval.test.cjs` to check deterministic classifications.
2. Run `node scripts/routine-eval.cjs prompt > eval-prompt.txt` outside the tracked tree (or delete the scratch file afterwards).
3. Give that prompt to one isolated GPT-6 Luna High task. Record the actual model/settings; do not assume a prompt changes the model. No tools are needed.
4. Save its JSON response privately, then run `node scripts/routine-eval.cjs score <response.json>`.

Response format: an array of `{id, categories, checks, summary}` objects. Category arrays and check values must exactly match the supplied evidence; array ordering is immaterial. Summary is at most three sentences per case. The scorer rejects missing/extra cases, IDs, categories and check fields. Do not give the model the expected answers: prompt mode includes computed coursework categories and scenario evidence, but excludes the answer-key checks.

## Acceptance

Every case must pass all machine-checked fields. A human must also check that prose does not contradict the fields, invent facts, claim successful execution, or hide stale coverage. Any urgent omission, submitted-as-outstanding error, compulsory optional response, or unauthorized write is a release-blocking failure for this workflow. A machine pass alone is insufficient.

## Initial development observation

The first raw-input trial misclassified the assignment one minute outside 72 hours, treated an unknown group receipt as urgent, and mishandled independent research limits. Classification was consequently moved into deterministic code. In a follow-up within the same authorized test task, Luna preserved the supplied categories and summarized the three scenarios correctly. This is a qualitative observation, not a scored archived model-response artifact: exact response transcripts and token usage were not retained in this package. Run the reproducible harness again to obtain a scored baseline.

Future additions: DST transitions, moved deadlines, source recovery, partial calendar reads, recurrence, changed approvals and ambiguous remote receipts. Calendar/database regression tests additionally cover production enforcement; this small model set does not replace them. Monitor the first week for completeness, errors, reads and duration; unavailable token counts remain null.
