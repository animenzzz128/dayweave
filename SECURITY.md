# Privacy and security

This project has no credential store. The optional hosted mode ([private instance](docs/private-instance.md)) signs in one allowlisted Google account and reads its secrets only from the host's secret store. Keep secrets in the external tool's credential system. Do not paste credentials into snapshots, operating prompts, browser storage, issue reports, or release assets.

The renderer embeds records into a standalone HTML file. Input text is escaped and source links accept HTTP(S) only. This limits script injection; it does not anonymize data. Do not serve private output publicly or bind the preview server to a public interface; only the hosted mode, behind HTTPS and sign-in, listens on all interfaces.

Report suspected vulnerabilities privately to the repository owner through an available private channel. Avoid posting secrets or personal source data in public issues. If private reporting is not available, request a private contact route without including exploit-sensitive or personal details.

The included privacy guard is a basic tracked-file check, not a comprehensive secret scanner. Review names, dates, organizations, links, comments, commit metadata, screenshots, and release artifacts manually. Removing a file in a later commit does not remove it from earlier history.

## Before making the repository public

- Review every reachable commit and tag, not only the current working tree.
- Confirm fixtures and screenshots are synthetic and contain no real accounts or records.
- Check branches, issues, PRs, CI logs, release notes, and release assets.
- Run checks and inspect a clean-checkout demo.
- Choose an open-source license, or document the intended rights clearly.
- Enable suitable secret scanning and private vulnerability reporting where available.
- Change visibility only when the owner explicitly asks.
