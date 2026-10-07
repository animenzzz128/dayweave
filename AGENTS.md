# Repository instructions

- Keep all tracked examples fictional. Never copy personal snapshots, outputs, resumes, account URLs, absolute user paths, or automation state into Git.
- Runtime data lives under ignored `.local/` or an external DAYWEAVE_DATA_DIR. Generated HTML may contain private data and stays ignored.
- Read README.md and docs/data-contract.md before changing data or rendering behavior.
- For a requested change, create a short feature/fix branch and a focused PR. Use an issue for substantial or deferred work; small fixes need no separate issue. Do not merge, release, change visibility, or deploy unless the user asks.
- Validate with npm run check, npm test, npm run demo, and npm run privacy after staging. Review the staged diff and all release assets for personal data. Use synthetic screenshots.
- Never modify external calendars, send messages, or submit assignments as part of a build, test, or scheduled refresh. Review selections are not approval.
- Preserve source-failure records, stable identifiers, submission uncertainty, and the difference between required and selectable coursework.
- Keep zero external runtime dependencies unless a requested feature justifies adding one.
- Do not assume the demo scheduler or integrations exist: the assistant workflow supplies data; adapters are future work.
