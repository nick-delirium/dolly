---
id: 5nbx4mdy
slug: add-dolly-update-command
title: Add dolly update command
status: validating
owner: nick.delirium
collaborators: [nick.delirium]
tags: []
steps: 2
spec_version: 1
created: 2026-08-25T17:15:07Z
updated: 2026-08-25T17:42:44Z
---

# 5nbx4mdy · Add dolly update command

<!-- dolly:header -->
`validating` · spec v1 · @nick.delirium · 2 steps · updated 2026-08-25 17:42Z
<!-- /dolly:header -->

## Spec

Explicit human command that detects how this copy was installed (linked clone vs npm-global) and updates in place: git pull --ff-only + npm install for a clone, npm i -g github:<slug> for a package. --check reports only, --dry-run prints the plan, refuses on a dirty clone. The passive update notice points at it.

## Success Criteria

- [ ] _TBD_

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-08-25 17:15Z` @nick.delirium: status todo → working.
- `2026-08-25 17:22Z` @nick.delirium: dolly update added: detects install kind (linked clone vs npm-global), pulls+rebuilds with --ff-only (refuses on dirty tree without --force) or reinstalls github:<slug>; --check and --dry-run for looking before leaping. Passive notice now points at it; /dolly:update checkpoint slash command renamed to /dolly:checkpoint to avoid the verb collision.
  files: `.claude/commands/dolly/board.md`, `.claude/commands/dolly/checkpoint.md`, `.claude/commands/dolly/housekeep.md`, `.claude/commands/dolly/memo.md`, `.claude/skills/dolly/SKILL.md`, `.opencode/commands/dolly-adopt.md` +56 more · full: `steps.md#0001`
- `2026-08-25 17:22Z` @nick.delirium: status working → validating. human: run dolly update --check and dolly update --dry-run; real pull can wait until these changes are committed
- `2026-08-25 17:42Z` @nick.delirium: Cross-feature review of today's work landed here by mistake via 'step current' — see jd8s6t23 step 0003 for the six findings fixed (docs re-teaching numeric ids, memo wrong-file+regex bugs, v5 migration rmrf data-loss path, picker empty-list bug, missing session links, README drift). Note: jd8s6t23 is an old smoke-test stuck in working and currently hijacks every 'current' resolution in this repo — human may want to close it.
  files: `src/cli.ts`, `src/migrate.ts`, `src/core/memo.ts`, `src/prompt.ts`, `src/templates/instructions.ts`, `skills/dolly/SKILL.md` +1 more

