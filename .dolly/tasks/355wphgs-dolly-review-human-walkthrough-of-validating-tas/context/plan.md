<!-- dolly plan · created 2026-10-20T10:39:40Z · @nick-delirium -->
# Plan — dolly review: human walkthrough of validating tasks

> Interview record. Every section below must be answered before `dolly plan finalize`.
> Gate: `dolly plan check` fails while a section is empty, `_TBD_`, or an Open Question is unchecked.

## Brief

Accepted proposal: 9 tasks sit in validating for months; agents can't set done so the human is the bottleneck. dolly review walks validating tasks one by one: criteria + validation note, tick boxes, done / back to working.

## Problem

9 tasks sit in `validating`, the oldest ~2 months (2rhqyc8c, 6mq9hmg4, xj6mxdp6, …). Agents may not set `done`, so the human is the only way out — and closing one means reading the task, ticking criteria by hand-editing task.md (no command ticks a criterion), then `dolly status <ref> done`. It doesn't happen; the board and session-start keep presenting finished work as open, and stale `working` tasks (6qp6wxbq) keep being offered as "most recent open task".

## Goal

`dolly review` gives a human one interactive pass over the validating queue, oldest first. Per task it shows the short spec, criteria with their checkboxes, the note the agent left when it moved the task to validating, the files and the step count; the human ticks criteria, marks done, sends it back to working with a note, or skips. Every action goes through core functions and leaves a log line. Agents cannot use it.

## Scope

**In:**
- core: `setCriterion(store, task, index, checked)` toggles one `- [ ]`/`- [x]` line in `## Success Criteria` with a log line; `validationNote(task)` = note on the latest move into the review status
- `src/review.ts` (prints, so outside core — like wizard.ts) over the injectable `Term`: arrow-key UI plus the numbered fallback
- `dolly review [ref] [--status s]` — default the review status from config; a ref reviews one task
- refuses with a clear message when `notAHuman()` — no agent path, no MCP tool
- the write lock is taken per action, never held while waiting on a key
- board / session-start: one hint line "N validating — `dolly review`" when the queue is non-empty (session-start only if it fits the footprint budget)
- README

**Out:**
- agents closing tasks
- editing spec or criteria text from the review screen
- bulk "mark all done"

## Success Criteria

- [ ] without a TTY (or under an agent) `dolly review` exits non-zero with a human-only message; the store is unchanged
- [ ] validating tasks are walked oldest-updated first; each screen shows short spec, criteria, validation note, files
- [ ] toggling criterion 2 changes only that line of task.md and logs "criterion 2 checked"; frontmatter round-trips
- [ ] done → status done with log line; back-to-working requires a non-empty note
- [ ] numbered fallback works end to end (injected Term test)
- [ ] a `dolly hook stop` run while review waits on a key completes (lock not held while idle)
- [ ] npm test green

## Changes

- `src/core/task.ts` — `setCriterion`, `validationNote`
- `src/review.ts` (new) — the walk
- `src/cli.ts` — `review` command, FLAGS, help; per-action locking (not via `writesStore`)
- `src/core/lock.ts` — reuse `withLock` (guess) for per-action writes
- `src/core/render.ts` — board hint
- `README.md`, `tests/review.test.mjs`

## Risks

- Criteria written in other shapes (plain bullets, nested) → only `- [ ]`/`- [x]` lines of task.md's Success Criteria are toggleable; others shown read-only.
- Task changed by an agent while the screen is open → reload under the lock before each write; act on the fresh copy.
- TTY detection wrong in some terminal → `notAHuman()` is the same predicate the wizard uses; numbered fallback covers no-raw-mode terminals.

## Test Plan

- Unit: setCriterion toggles exactly one line, both directions, index bounds; validationNote picks the latest move into validating.
- Integration: review driven through an injected Term — tick, done, back-to-working with note, skip; refusal without a TTY; hook stop completes while review idles.
- Manual: run `dolly review` in this repo over the 9 validating tasks.

## Open Questions

- [x] Shape? → interactive walk with numbered fallback (Q&A)

## Q&A

**Q (2026-10-20 10:42Z):** Shape of dolly review?

**A:** Interactive walk over validating tasks, oldest first: short spec, criteria, validation note, files. Keys: tick criteria, done, back to working (+note), skip. Numbered fallback without raw mode like the wizard. Refuses without a TTY — agents cannot close tasks.

