# Incremental roadmap

Current behavior/limits: project-state.md. Each outcome has its own acceptance and PR.

| Stage | Status | Outcome |
| --- | --- | --- |
| Phase1–3 | Implemented foundation | Coursework/calendar review, assignment help, career pipeline; collection remains assistant-driven. |
| Phase4 | Implemented | v1.5.0 milestone, SQLite/routes/history/Q versions/routine/eval; startup fix#10 merged. |
| Governance | Foundation implemented | Durable docs/templates and isolated-runtime workflow are in place. Three independent scheduled refreshes observed through cloud collection (2026-10-24 to 10-26, #18/#56). |
| Phase5 | Feasibility assessed; executor NO-GO | [Issue #14 gate](outlook-feasibility.md): authorization and approval-to-executor channel unverified; retain chat approval. [Google path](google.md#phase-5-feasibility-google-path): connector access verified; approved end-to-end write and unattended behavior unverified. Re-gate under #19. Writer, reliable outcomes and improved collection remain future work. |
| Phase6 | Initial completion implemented and merged (milestone 1, #20), released as v1.5.5 and in the stable deployment (functional acceptance on the private database not performed) | [Plan](phase-6-plan.md): effort calibration (#26), workload modes (#27), career feedback ordering (#28) and weekly trends (#29). They were delivered as dependent scoped PRs, merged in order on user request: PR33, PR34 and PR36, then the version/documentation PR37 on 2026-10-11. Issues #26–#29 are closed. Status and verification: project-state.md. Manual checks and known limits: [acceptance guide](phase-6-acceptance.md). Further modes, scores, metrics or automatic estimate use need observed use and a user decision. |
| Google providers | Implemented (DW-GOOGLE-01) | Read-only Gmail (`label:Yale`) and Google provider identity; daily plan recommendations; approved Google Calendar writes, first real end-to-end write on 2026-10-27 from the hosted site ([direct writes](google-direct.md), [bridge](google.md)). |
| Web launch (M2) | In progress (DW-1011, #51/#52) | Public bilingual Luna demo built from `web/` with the shared rules, MIT license and a publication audit before the repository goes public; then UI polish and case study (#53), in-product AI with evals (#54; cited brief, breakdowns, one-line proposals and the 21-case eval merged on 2026-10-22 in PR65–67, 61/63 after a scorer fix), a private instance (#55; deployed on Fly.io since 2026-10-22, [procedure](private-instance.md)), cloud collection (#56; daily since 2026-10-24), approved calendar writes from the site (first real write 2026-10-27, closing the #1/#42 scope) and portfolio assets (#57, next). Deploying, changing visibility and importing real data each need the owner's approval. |
| Career preview | Demo only | Job match (explainable score, requirement evidence, resume fixes), an application pipeline with follow-up nudges, an interview prep pack built from resume lines, and people to contact (relationship stages, shared ground, outreach and thank-you drafts to copy) are previewed in the public demo with fictional data. Real use needs owner-supplied inputs: pasted postings or links, the resume kept privately on the instance, and LinkedIn's own data export or pasted profiles (no scraping, no sending). Generation must pass the same evidence checks and a Luna eval set before release. Later candidates (owner decision 2026-10-27): tailored resume versions, a story bank, sponsorship evidence from public filings. |
| Agent workflow | Trial (#16 policy, #17 validator, #21 evaluation) | [Coordinator/CLI-worker delivery](agent-workflow.md); adoption is a user decision after measured pilots and a single-agent baseline. |

Phase5 sequence:
1. Demonstrate supported authorization/trigger channel, including admin restrictions and login expiry; decide go/no-go before implementing remote writer.
2. Exact version, fresh conflicts/duplicates, idempotency, ambiguous-save reconciliation and verified receipt.
3. Execution states and actionable recovery UX.
4. Permitted structured collection, reduced reads and measured coverage.
Keep chat approval if no reliable trigger exists. Email is a bounded read-only Gmail snapshot; sending or mailbox changes need an explicit new request. Mobile/sync/hosting are separate future choices.

Observe initial routines for coverage, urgent omissions, submitted/optional errors, failures, reads, duration and available usage. Tokens unavailable remain null. Expand Luna eval with DST, moved deadlines and ambiguous receipts; archive scored responses only when captured. Do not promise fixed savings.
