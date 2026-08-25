---
id: 3pkndyj2
slug: hash-task-ids-fuzzy-title-matching
title: Hash task ids + fuzzy title matching
status: validating
owner: nick.delirium
collaborators: [nick.delirium]
tags: []
steps: 1
spec_version: 2
created: 2026-08-25T15:14:54Z
updated: 2026-08-25T16:49:16Z
---

# 3pkndyj2 · Hash task ids + fuzzy title matching

<!-- dolly:header -->
`validating` · spec v2 · @nick.delirium · 1 step · updated 2026-08-25 16:49Z
<!-- /dolly:header -->

## Spec

New tasks get 8-symbol no-vowel base32 ids. Any command taking <ref> accepts a hash, an exact/partial title via fuzzy match, or current. One clear fuzzy winner selects directly; several candidates open an interactive picker (prefilled query) in a TTY, or a numbered list when scripted.

Full spec: `context/spec.md` · plan: `context/plan.md`

## Success Criteria

- [ ] new tasks have 8-char vowel-free ids; collision regenerates
- [ ] dolly continue <fuzzy title fragment> picks the single match directly
- [ ] ambiguous match opens interactive picker with the query prefilled; non-TTY prints numbered candidates
- [ ] hashes always accepted everywhere refs are taken
- [ ] dolly migrate rewrites legacy numeric ids losslessly (logs keep pointing at the right tasks); idempotent
- [ ] npm test green

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-08-25 15:28Z` @nick.delirium: spec → v2. planning finished — spec derived from plan.md
  previous version kept in `spec.md`

### plan finalized · 2026-08-25 15:28Z · @nick.delirium

Plan complete. Status → todo.

- plan: `context/plan.md`
- `2026-08-25 15:54Z` @nick.delirium: status todo → working.
- `2026-08-25 16:49Z` @nick.delirium: Task ids are now 8-char vowel-free hashes; any ref accepts id/slug/substring/fuzzy title, ambiguous matches open an interactive type-to-filter picker (numbered list when scripted); v6 migration rewrote all legacy ids losslessly (this repo migrated, e.g. 0009 → 3pkndyj2).
  files: `.claude/commands/dolly/housekeep.md`, `.opencode/commands/dolly-adopt.md`, `.opencode/commands/dolly-board.md`, `.opencode/commands/dolly-housekeep.md`, `.opencode/commands/dolly-plan.md`, `.opencode/commands/dolly-resume.md` +42 more · full: `steps.md#0001`
- `2026-08-25 16:49Z` @nick.delirium: status working → validating. human: try dolly continue <part of a task title> in a real TTY to see the picker

