---
id: q8gr2gnc
slug: publish-to-npm-as-dlrm-dolly
title: Publish to npm as @dlrm/dolly
status: validating
owner: nick-delirium
collaborators: [nick-delirium]
tags: []
steps: 3
spec_version: 1
created: 2026-11-20T10:18:56Z
updated: 2026-11-20T10:45:34Z
sessions: [681d18ed-9add-4d60-b97f-80d377aa129b]
---

# q8gr2gnc · Publish to npm as @dlrm/dolly

<!-- dolly:header -->
`validating` · spec v1 · @nick-delirium · 3 steps · updated 2026-11-20 10:45Z
<!-- /dolly:header -->

## Spec

Unscoped 'dolly' is owned by someone else on npm. Publish as @dlrm/dolly (bin stays 'dolly'); read the package name from package.json so the update check and self-update stop querying the wrong package.

## Success Criteria

- [ ] _TBD_

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-11-20 10:19Z` @nick-delirium: status todo → working.
- `2026-11-20 10:20Z` @nick-delirium: Package renamed to @dlrm/dolly (unscoped 'dolly' is someone else's); update check and self-update now use the package name from package.json; 362 tests pass
  files: `.claude-plugin/plugin.json`, `README.md`, `package-lock.json`, `package.json`, `src/core/pkg.ts`, `src/core/selfupdate.ts` +3 more · full: `steps.md#0001-nick-delirium`
- `2026-11-20 10:20Z` @nick-delirium: status working → validating. Create npm org 'dlrm', then npm publish; afterwards check that 'npm i -g @dlrm/dolly' gives a working 'dolly' and that 'dolly update --check' reports source npm
- `2026-11-20 10:38Z` @nick-delirium: Snapshots ship via npm 'next' tag: update follows the version's channel, semver prerelease ordering fixed, README migration note for the old 'dolly' registration; raw github: installs found broken on npm 11 and dropped
  files: `.claude-plugin/plugin.json`, `README.md`, `package-lock.json`, `package.json`, `src/core/pkg.ts`, `src/core/selfupdate.ts` +3 more · full: `steps.md#0002-nick-delirium`
- `2026-11-20 10:38Z` @nick-delirium: status validating → validating. npm uninstall -g dolly (old link name), then npm publish; check npm i -g @dlrm/dolly gives a working dolly and dolly update --dry-run shows @latest
- `2026-11-20 10:45Z` @nick-delirium: 1.0.0 published to npm as @dlrm/dolly (dist-tag latest); committed and tagged v1.0.0 on dolly-review-fixes

