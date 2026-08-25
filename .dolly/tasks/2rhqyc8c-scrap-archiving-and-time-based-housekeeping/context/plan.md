<!-- dolly plan · created 2026-08-25T15:14:54Z · @nick.delirium -->
# Plan — Scrap archiving and time-based housekeeping

> Interview record. Every section below must be answered before `dolly plan finalize`.
> Gate: `dolly plan check` fails while a section is empty, `_TBD_`, or an Open Question is unchecked.

## Brief

Archiving causes git history noise. Remove archiving and all related concepts/commands. All tasks stay in one place; nothing moves or changes status automatically based on time — only via explicit user commands or agent actions on user ask.

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

## Q&A

_none yet_
