<!-- dolly steps · task wkq7zz3m · append-only, newest at the bottom -->
# Full step context — CI: GitHub Actions for PRs (build, test, pack smoke test, CodeQL)

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001-nick.delirium -->
## 0001 · 2026-11-25T23:14:57Z · @nick.delirium

- task status: working
- files: `.github/workflows/ci.yml`, `.github/workflows/codeql.yml`, `.github/dependabot.yml`, `tests/projectsrepo.test.mjs`

## What landed
- .github/workflows/ci.yml — on PR, push to main, manual:
  - `test`: npm ci (prepare builds dist/) + npm test on ubuntu × Node 20/22/24, plus macos × Node 22. fail-fast off, read-only token, PR runs cancel superseded runs.
  - `package`: npm pack, asserts the tarball keeps dist/cli.js, bin/dolly-hook.mjs, plugins/opencode.js, .claude-plugin/plugin.json, skills/*/SKILL.md, commands/, README, LICENSE and leaks no src/, tests/ or .dolly/; installs the tarball globally; `dolly --version` must equal package.json; init (--no-agents) → new --status working → step → board → context in a fresh repo; `new --status in-progress` must fail.
- .github/workflows/codeql.yml — javascript-typescript, build-mode none, security-and-quality, on PR/main + weekly.
- .github/dependabot.yml — weekly, grouped: github-actions, npm devDependencies.
- Action majors: checkout@v7 (2026-07), setup-node@v7 (2026-10), codeql-action@v4.

## Found by running it on Linux (node:20/22/24 containers)
- tests/projectsrepo.test.mjs:56 committed in ~/.dolly/projects with no identity. Passes on macOS (git guesses user@host.local) but fails on any host without a mail domain — CI runners, containers. Fixed with `git -c user.name -c user.email commit`. A global git identity in CI cannot help: tests/isolate.mjs swaps HOME. So the workflow sets none on purpose — CI is what catches the next such test.
- package.json is at 1.0.1 (uncommitted, the user's release in progress) while .claude-plugin/plugin.json is 1.0.0: update.test's version check fails on every Node until plugin.json is bumped. Left for the user — not part of this task.

## Verified
- actionlint 1.7.7 (+shellcheck) clean on both workflows.
- With plugin.json matched inside the container: suite 368/368 on Linux; package job's exact run: blocks (extracted from ci.yml) exit 0.
- Not verified: the macOS runner and CodeQL themselves — they only run on GitHub.

## Dead end
- `dolly init --agents none` is not "no agents" — it errors (unknown agent). The flag is `--no-agents`.
<!-- /dolly:step 0001-nick.delirium -->
