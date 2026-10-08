# Career research and local progress

The assistant supplies bounded, source-backed research. The static page neither discovers jobs nor reads inboxes. Enable career.enabled only after recording user preferences. Email remains disabled until separately authorized.

## Records

career.profile holds user-confirmed preferences and provenance: startYear, employmentType, primaryMarkets, secondaryMarkets, degree, usSponsorshipRequired, workEligibility, project evidence and unresolved metrics. Never infer immigration eligibility. Candidate and role records use stable id and HTTPS source, checkedAt, evidence, verification, market, fit/reason, requirements and nextStep. Roles add startYear, sponsorship (yes/no/unknown), degreeGap and status. Candidates add relationship and scores (role/shared/market/reason, each 0–5). These are explainable editorial scores, not probabilities.

The collector targets up to five candidates, typically four primary APAC and one US; return fewer when evidence is insufficient. Normalize profile links, consult history, exclude connected/pending/contacted/dismissed people and avoid recommending the same people as new on successive days. Keep saved items available in the history. Check original job postings and label indexed-only verification honestly.

## Local controls and synchronization

Save, dismiss, applied, contacted, connected and pending record user-reported statuses only. Restore resets local exclusion. Draft buttons prepare requests for chat; no communication is sent. Export local progress, then ask the assistant to import the exported JSON:

`node scripts/import-progress.cjs /path/to/export.json`

Set DAYWEAVE_DATA_DIR to the private snapshot directory. The importer accepts only known career URLs, recognized statuses and valid timestamps. It ignores approval selections and action journals. Rebuild afterward. Browser state is not automatically synchronized. The newest timestamp wins between local and imported history.

Weekly review counts latest statuses updated within seven days; it is not a full event ledger. Assignment effort is cumulative, not a claim of this week's work. Sunday assistant reviews should additionally compare snapshots, workload and unresolved follow-ups.

## Failure and privacy

A failed career source retains previous research with a stale notice. Each card carries its evidence time. No credentials, personal profile, real candidate records or generated private HTML belong in Git. Demo records are fictional. Email triage is deferred by opt-out; enabling it will require account verification and a bounded reader workflow in a later increment.
