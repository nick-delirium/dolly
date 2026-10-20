---
id: m6x2876y
slug: tests-leak-global-stores-into-the-real-dolly
title: Tests leak global stores into the real ~/.dolly
status: validating
owner: nick-delirium
collaborators: [nick-delirium]
tags: [tests]
steps: 2
spec_version: 1
created: 2026-10-20T10:47:36Z
updated: 2026-10-20T11:49:01Z
sessions: [30490afd-79ca-44be-91bb-1f8b86dff17b]
---

# m6x2876y · Tests leak global stores into the real ~/.dolly

<!-- dolly:header -->
`validating` · spec v1 · @nick-delirium · 2 steps · updated 2026-10-20 11:49Z
<!-- /dolly:header -->

## Spec

tests/install.test.mjs creates a global store under the developer's real ~/.dolly/projects and tests/migrate.test.mjs writes index.json entries there (29 leftover dolly-test-* dirs found). Every test must run under an isolated DOLLY_HOME/HOME; add a guard test that fails if the suite writes outside its tmp home.

## Success Criteria

- [ ] _TBD_

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-10-20 10:47Z` @nick-delirium: status todo → working.
- `2026-10-20 10:50Z` @nick-delirium: Test suite now runs under a throwaway HOME/DOLLY_HOME preloaded by npm test; no more global stores or index entries leaking into the real ~/.dolly, and the transcript test no longer reads the real ~/.claude/projects.
  files: `tests/isolate.mjs`, `tests/isolation.test.mjs`, `package.json` · full: `steps.md#0001`
- `2026-10-20 10:50Z` @nick-delirium: status working → validating. npm test (285 green). Then: find ~/.dolly/projects -maxdepth 1 -name 'dolly-test*' -newer package.json → nothing new. Leftovers from before still sit in ~/.dolly (27 dirs, ~110 index entries) — delete by hand if wanted.
- `2026-10-20 11:49Z` @nick-delirium: Leftovers cleaned on request: 27 dolly-test-* stores moved to the session scratchpad, 107 dead index entries pruned (backup of index.json kept there); ~/.dolly/projects now lists the 3 real projects.

