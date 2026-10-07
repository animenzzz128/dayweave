# Contributing

## Small changes, clear history

Use `main` as the releasable branch. Work on `feat/<short-name>`, `fix/<short-name>`, or `docs/<short-name>`. Keep each PR focused on one behavior. For larger or deferred work, create an issue first and reference it with `Closes #…`; do not create duplicate issues for trivial fixes.

PR descriptions should explain the trigger/problem, resulting behavior, validation, and material limitations. Include screenshots using synthetic data for visible UI changes. Do not attach private dashboard screenshots or source records.

Run `npm run check`, `npm test`, `npm run demo`, and `npm run privacy` after staging intended changes. For UI changes, check the demo in a browser, including the affected controls and narrow-window layout. Tests must use fictional data only.

Prefer squash merges and delete merged branches. Use semantic versions: patch for compatible fixes, minor for compatible features, major for breaking data/API changes. Update CHANGELOG.md and package.json, tag the reviewed commit, and publish release notes. Do not rewrite published tags.

Merging or changing repository visibility requires the repository owner's explicit instruction. Do not automatically deploy GitHub changes to a private live dashboard.

## Personal deployments

Maintain reusable code here and private configuration/snapshots outside Git. Apply an approved release to a personal deployment deliberately, retaining its local data and configuration. Scheduled refreshes modify data only; they must not commit runtime records or regenerate the frontend.

## Privacy

Never commit credentials, browser sessions, source exports, student records, calendar entries, resumes, contacts, absolute user paths, or generated private dashboards. `.gitignore` is a convenience, not a security boundary. Review `git diff --cached` before pushing. See SECURITY.md.
