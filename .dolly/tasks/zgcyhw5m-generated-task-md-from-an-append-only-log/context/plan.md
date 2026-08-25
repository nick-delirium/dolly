<!-- dolly plan · created 2026-08-07T10:43:02Z · @nick-delirium -->
# Plan — Generated task.md from an append-only log

> Interview record. Every section below must be answered before `dolly plan finalize`.
> Gate: `dolly plan check` fails while a section is empty, `_TBD_`, or an Open Question is unchecked.

## Brief

From the review: task.md is both a human doc and a parsed database, which causes the section-collision, counter-drift and merge-conflict problems. Make task.md a generated rendering of an append-only log.jsonl; step ids NNNN-user so concurrent teammates never collide, resolvable by bare number against the current git user; derive steps and spec_version instead of storing them.

## Problem

task.md is simultaneously a human document and a parsed database. dolly parses prose for structure in five places — YAML-ish frontmatter, `## ` sections, `<!-- dolly:step -->` markers, `- files:` trailers, `` - `stamp` @user: `` log lines — and content can impersonate any of them. Four bugs of exactly this class have already shipped and been fixed: marker injection, migration rewriting prose, arg parsing, section collision.

It also breaks the "shared" premise. Every write touches `updated`, `steps` and the log tail; step ids come from a local per-task counter. Two teammates working one task in parallel produce the same step id and conflicting counters — the worst kind of merge conflict, since both sides incremented.

## Goal

Structure lives where escaping is solved, prose lives where it cannot collide. An append-only `log.jsonl` is the record; `task.md` becomes a generated rendering that dolly never parses back. Concurrent teammates merge as a union with no conflict, and a corrupted `task.md` is regenerable rather than lost.

## Scope

**In:**

- `log.jsonl` per task: one JSON object per event (step | status | spec | note)
- `task.md` generated from it, plus `dolly render` to rebuild
- step ids `NNNN-user`, resolvable by bare number against the current git user
- derive `steps` and `spec_version` instead of storing them in frontmatter
- migration from the current layout, and the section-collision guard removed once it is moot

**Out:**

- changing `context/spec.md` or `context/steps.md` prose files
- any change to the CLI surface: command names and flags stay
- a database or index beyond the jsonl

## Success Criteria

- [ ] two teammates can each log a step offline on the same task and the result merges with no conflict
- [ ] `dolly render` rebuilds a deleted or corrupted task.md identically from log.jsonl
- [ ] a spec whose prose contains `## Log` no longer affects anything, and the assertOneSection guard is removed
- [ ] `steps` and `spec_version` are derived; deleting them from frontmatter changes no output
- [ ] a bare step number resolves against the current git user, and lists candidates when still ambiguous
- [ ] migration converts an existing store with no data loss, and is idempotent
- [ ] every existing test still passes with no change to the CLI surface

## Changes

- `src/core/log.ts` (new) — read/append `log.jsonl`, one object per event
- `src/core/render-task.ts` (new) — generate task.md from the log
- `src/core/task.ts` — writes go to the log; section helpers stop being the write path (guess: the largest change)
- `src/core/related.ts` — `parseLog` reads jsonl instead of markdown lines, and gets simpler
- `src/migrate.ts` — parse existing task.md once into log.jsonl; the only irreversible step, so it must be dry-runnable
- `src/cli.ts` — add `dolly render`
- `src/core/md.ts` — `countSections`/`assertOneSection` become dead once task.md is generated

## Risks

- **The migration is the dangerous part.** It parses the very prose whose ambiguity motivated the change, so a task.md with a duplicate heading migrates wrong. Fallback: refuse and report, do not guess.
- Two sources of truth exist during the transition. Mitigation: log.jsonl is authoritative the moment it exists, and task.md is regenerated on every write.
- Losing hand-editability of task.md. Accepted — already forbidden — but `dolly render` must be reliable or a corrupted store becomes unrecoverable.
- jsonl is less pleasant to read raw than markdown. Mitigation: nobody should need to; `dolly show` and the generated task.md are the human surface.

## Test Plan

Unit: append/read round-trip of every event kind; id allocation with two different users; derived steps and spec_version; render output byte-identical after a no-op rewrite.

Integration: simulate two teammates by writing two logs and concatenating them, assert the merge is a valid union with distinct ids; a spec containing `## Log` produces a correct task.md; migrate an existing store and assert every step, file list and spec version survives.

Manual: migrate this repo own store — 13 steps, spec v2 — and diff the generated task.md against the current one.

## Open Questions

- [ ] Should `log.jsonl` also absorb `context/steps.md` bodies, or do prose bodies stay in markdown keyed by event id? Leaning: keep prose in markdown, since diffs of prose are the thing humans read in PRs.
- [ ] Does `NNNN` stay a per-task counter (so offline teammates both produce 0013, distinguished by user), or become a global monotonic value? Leaning: per-task counter, since the point is that collisions are harmless.

## Q&A

**Q (2026-08-07 10:43Z):** Step id format, given it must stay easy to navigate and work with continue?

**A:** NNNN-user (e.g. 0013-nick-delirium). Numbers stay sortable, offline teammates never collide. Lookups accept the bare number and resolve against the current git user when several match, listing them if still ambiguous.

**Q (2026-08-07 10:43Z):** Is task.md still hand-editable after this?

**A:** No. It becomes a generated rendering of log.jsonl, regenerable with . Acceptable because the tool already forbids hand-editing .dolly/**, and it makes a corrupted task.md repairable instead of lost.

**Q (2026-08-07 10:43Z):** Should the section-collision bug (duplicate ## Log) be fixed separately first?

**A:** No — a generated task.md is never parsed back, so the bug disappears here for free. An interim guard that throws was shipped instead of marker-fencing that this task would delete.

**Q (2026-08-07 10:43Z):** Keep .dolly/README.md?

**A:** Yes, it is self-documentation for anyone opening the repo. Only stop regenerating it on every migrate.

**Q (2026-08-07 10:44Z):** Correction to the answer above, which lost a word to a shell quoting slip: what regenerates task.md?

**A:** A `dolly render` command. The earlier answer should read "regenerable with `dolly render`".

