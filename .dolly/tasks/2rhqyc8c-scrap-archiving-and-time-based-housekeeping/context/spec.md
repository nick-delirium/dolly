<!-- dolly spec · task 2rhqyc8c -->
# Spec — Scrap archiving and time-based housekeeping

**current: v2** · updated 2026-08-25T15:28:22Z by @nick.delirium · superseded versions are kept at the bottom of this file

<!-- dolly:spec-current -->
<!-- v2 · 2026-08-25T15:28:22Z · @nick.delirium -->

# Scrap archiving and time-based housekeeping

## Problem

Auto-archiving moves task dirs to archive/YYYY-MM/ on timers, producing noisy git history (renames + deletes) on every housekeep run. User: 'archiving is causing fair bit of noise in the project git history — scrap that and all related concepts/commands.'

## Goal

Every task lives in tasks/ forever. Nothing is ever moved, archived, flagged stale, or pruned automatically — the only mutations are explicit commands typed by a human or run by an agent on request. Git history stays quiet.

## Scope

In:
- delete housekeep command, src/core/housekeep.ts, archive/restore commands, archiveTask/store support
- remove housekeep.* config keys from DEFAULT_CONFIG + wizard/prompt questions
- remove ARCHIVED section from board, stale flagging everywhere
- migrate: flatten existing archive/YYYY-MM/* back into tasks/
- README rewrite of affected sections

Out:
- schema version bump beyond what migrate needs
- any replacement retention mechanism

## Success Criteria

- [ ] dolly housekeep/archive/restore are gone (unknown-command error)
- [ ] dolly migrate flattens legacy archive dirs into tasks/, idempotent, --dry-run shows detail
- [ ] no code path moves a task dir or changes status without an explicit command
- [ ] board/context/session-start never mention archive or stale
- [ ] npm test green

## Changes

- delete src/core/housekeep.ts
- cli.ts: drop housekeep/archive/restore commands, housekeep config keys, wizard question
- store.ts: drop archive-dir resolution/listing
- wizard.ts/prompt flows: remove housekeeping windows questions
- migrate.ts: new chain step — move archive/**/NNNN-* dirs to tasks/, keep frontmatter untouched
- templates/instructions.ts: drop 'housekeep' mentions if any
- README: Housekeeping section removed; commands list updated

## Risks

- old stores with housekeep keys in config.json: unknown keys must be ignored silently, not crash
- archived tasks restored by migrate may collide with same-named dir in tasks/ (shouldn't happen but guard)
- docs/tests referencing housekeep need full sweep

## Test Plan

- unit: migrate flattens fixture archive tree; second run is a no-op
- unit: board/show work after flattening
- unit: unknown command housekeep errors cleanly
- manual: npm test green, this repo migrates cleanly

## Open Questions

- [x] Existing archives? → flatten into tasks/ via migrate (user)
- [x] Keep manual pruning? → no, scrap all of it (user)
<!-- /dolly:spec-current -->

---

## Superseded versions

<!-- dolly:spec-history -->
## v1 — 2026-08-25T15:14:54Z · @nick.delirium

> superseded by v2: planning finished — spec derived from plan.md

# Scrap archiving and time-based housekeeping

_Spec is being written by the planning interview. See `plan.md`._
<!-- /dolly:spec-history -->
