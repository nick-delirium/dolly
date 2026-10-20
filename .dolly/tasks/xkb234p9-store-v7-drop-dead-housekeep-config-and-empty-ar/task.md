---
id: xkb234p9
slug: store-v7-drop-dead-housekeep-config-and-empty-ar
title: "Store v7: drop dead housekeep config and empty archive dir"
status: validating
owner: nick-delirium
collaborators: [nick-delirium]
tags: [migrate]
steps: 2
spec_version: 1
created: 2026-10-20T10:47:36Z
updated: 2026-10-20T11:27:35Z
sessions: [30490afd-79ca-44be-91bb-1f8b86dff17b]
---

# xkb234p9 · Store v7: drop dead housekeep config and empty archive dir

<!-- dolly:header -->
`validating` · spec v1 · @nick-delirium · 2 steps · updated 2026-10-20 11:27Z
<!-- /dolly:header -->

## Spec

Archiving was scrapped (2rhqyc8c) but config.json still carries housekeep.* keys no code reads and .dolly/archive/ stays as an empty dir. Safe v7 migration removes both; STORE_VERSION → 7 also reserves the bump for compaction's new on-disk shapes (digest: frontmatter, steps.compacted.md).

## Success Criteria

- [ ] _TBD_

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-10-20 10:50Z` @nick-delirium: status todo → working.
- `2026-10-20 10:52Z` @nick-delirium: Store is now v7: a safe auto-migration drops the dead housekeep config and an archive/ holding no files; the bump also gates v6 dolly out of compaction's new on-disk shapes.
  files: `src/migrate.ts`, `src/core/types.ts`, `tests/migrate.test.mjs` · full: `steps.md#0001`
- `2026-10-20 10:52Z` @nick-delirium: status working → validating. npm test (287). .dolly/config.json in this repo lost its housekeep block (auto-migrated on the first command) — check the diff is only that + version 7.
- `2026-10-20 11:27Z` @nick-delirium: Review fix: v7 no longer deletes an archive/ holding only a .gitkeep — only Finder's .DS_Store counts as nobody's file.
  files: `src/migrate.ts`, `tests/migrate.test.mjs`

