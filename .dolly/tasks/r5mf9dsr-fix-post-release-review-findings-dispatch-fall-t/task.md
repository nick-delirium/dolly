---
id: r5mf9dsr
slug: fix-post-release-review-findings-dispatch-fall-t
title: "Fix post-release review findings: dispatch fall-through, fuzzy gaps, memo date/file bugs"
status: done
owner: nick.delirium
collaborators: [nick.delirium]
tags: []
steps: 2
spec_version: 1
created: 2026-08-30T11:50:56Z
updated: 2026-08-30T16:24:10Z
---

# r5mf9dsr · Fix post-release review findings: dispatch fall-through, fuzzy gaps, memo date/file bugs

<!-- dolly:header -->
`done` · spec v1 · @nick.delirium · 2 steps · updated 2026-08-30 16:24Z
<!-- /dolly:header -->

## Spec

Second review pass on 701d3d9 confirmed real bugs: archive/restore case labels fell through into cmdPlan (archive start creates a task), fuzzy matcher rejects any needle with a space and over-bonuses upper→lower, id generation has modulo bias, memo mixes UTC and local days and lists spec.md as a touched file. Fix all, with tests.

## Success Criteria

- [ ] _TBD_

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-08-30 11:55Z` @nick.delirium: Dispatch fall-through fixed: dolly archive/restore now fail with a removal notice instead of executing cmdPlan (archive start x created a task); stale help line deleted; fs2/path2 duplicate imports folded back into fs/path; memo --save ENOENT now a usage error. memo removed from WRITE_COMMANDS so the read-only digest still works on a newer store, with the version gate moved into the --save branch (newerStoreMsg helper shared with guardStoreVersion).
  files: `src/cli.ts`
- `2026-08-30 16:19Z` @nick.delirium: Fuzzy matching rewritten around zero-width needle separators: multi-word queries like 'hash ids' now find 'Hash task ids' (they previously returned null by construction — slugs contain no spaces), word order stays enforced, and the bonus table no longer treats acronym tails as boundaries. Memo digests convert UTC log stamps to local days, list only real files: trailers, and scan sessions by mtime-window instead of a blind newest-20 cap. All 216 tests pass; picker now fuzzy-narrows when no substring hits.
  files: `src/cli.ts`, `src/core/fuzzy.ts`, `src/core/memo.ts`, `src/core/store.ts`, `src/prompt.ts`, `tests/fuzzy.test.mjs` +1 more · full: `steps.md#0002`
- `2026-08-30 16:19Z` @nick.delirium: status working → validating. All 216 tests pass and multi-word refs verified against the real store. Worth a human try in a real TTY: dolly show hash ids, dolly context review findings, and the type-to-filter picker on an ambiguous ref — confirm the fuzzy narrowing feels right. Also skim the memo digest for 2026-08-25 to check the files lists read cleanly.
- `2026-08-30 16:24Z` @nick.delirium: status validating → done.

