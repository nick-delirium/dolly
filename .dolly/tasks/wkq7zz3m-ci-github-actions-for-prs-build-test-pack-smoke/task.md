---
id: wkq7zz3m
slug: ci-github-actions-for-prs-build-test-pack-smoke
title: "CI: GitHub Actions for PRs (build, test, pack smoke test, CodeQL)"
status: validating
owner: nick.delirium
collaborators: [nick.delirium]
tags: [ci]
steps: 1
spec_version: 1
created: 2026-11-25T23:08:15Z
updated: 2026-11-25T23:14:57Z
sessions: [660193b5-d32e-4da1-bf13-3f78d143f73c]
---

# wkq7zz3m · CI: GitHub Actions for PRs (build, test, pack smoke test, CodeQL)

<!-- dolly:header -->
`validating` · spec v1 · @nick.delirium · 1 step · updated 2026-11-25 23:14Z
<!-- /dolly:header -->

## Spec

Run on every PR and push to main: tsc build, the node:test suite across supported Node versions on Linux and macOS, an npm pack + install-from-tarball smoke test, and CodeQL. Free tier only.

## Success Criteria

- [ ] PRs run build+tests on a Node matrix and fail on a red suite
- [ ] the published package contents are smoke-tested from a packed tarball

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-11-25 23:08Z` @nick.delirium: status todo → working.
- `2026-11-25 23:14Z` @nick.delirium: CI on PRs: build+test on Linux Node 20/22/24 and macOS 22, npm pack + tarball install smoke test, CodeQL, Dependabot; running it on Linux surfaced a test that commits without a git identity (fixed)
  files: `.github/workflows/ci.yml`, `.github/workflows/codeql.yml`, `.github/dependabot.yml`, `tests/projectsrepo.test.mjs` · full: `steps.md#0001-nick.delirium`
- `2026-11-25 23:14Z` @nick.delirium: status working → validating. Bump .claude-plugin/plugin.json to 1.0.1 first (else CI is red). Then open a PR and check all 5 CI jobs + CodeQL go green; CodeQL results appear under Security → Code scanning.

