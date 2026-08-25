---
id: 2rhqyc8c
slug: scrap-archiving-and-time-based-housekeeping
title: Scrap archiving and time-based housekeeping
status: validating
owner: nick.delirium
collaborators: [nick.delirium]
tags: []
steps: 1
spec_version: 2
created: 2026-08-25T15:14:54Z
updated: 2026-08-25T15:54:58Z
---

# 2rhqyc8c · Scrap archiving and time-based housekeeping

<!-- dolly:header -->
`validating` · spec v2 · @nick.delirium · 1 step · updated 2026-08-25 15:54Z
<!-- /dolly:header -->

## Spec

Every task lives in tasks/ forever. Nothing is ever moved, archived, flagged stale, or pruned automatically — the only mutations are explicit commands typed by a human or run by an agent on request. Git history stays quiet.

Full spec: `context/spec.md` · plan: `context/plan.md`

## Success Criteria

- [ ] dolly housekeep/archive/restore are gone (unknown-command error)
- [ ] dolly migrate flattens legacy archive dirs into tasks/, idempotent, --dry-run shows detail
- [ ] no code path moves a task dir or changes status without an explicit command
- [ ] board/context/session-start never mention archive or stale
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
- `2026-08-25 15:28Z` @nick.delirium: status todo → working.
- `2026-08-25 15:54Z` @nick.delirium: Archiving and time-based housekeeping removed entirely: housekeep/archive/restore commands, auto-runs, config keys, MCP tools, board ARCHIVED section, stale flags all gone; v5 migration flattens archive/YYYY-MM back into tasks/ (this repo migrated: 5 tasks restored). Tasks now only ever change via explicit commands.
  files: `.claude/commands/dolly/housekeep.md`, `.opencode/commands/dolly-adopt.md`, `.opencode/commands/dolly-board.md`, `.opencode/commands/dolly-housekeep.md`, `.opencode/commands/dolly-plan.md`, `.opencode/commands/dolly-resume.md` +34 more
- `2026-08-25 15:54Z` @nick.delirium: status working → validating. human: skim git status for the migration diff shape (archive/ deletions + tasks/ additions) and confirm board reads right

