<!-- dolly plan · created 2026-10-20T10:39:40Z · @nick-delirium -->
# Plan — Compaction: agent-written rollups of long tasks and task groups

> Interview record. Every section below must be answered before `dolly plan finalize`.
> Gate: `dolly plan check` fails while a section is empty, `_TBD_`, or an Open Question is unchecked.

## Brief

perhaps we need compaction feature to compact long tasks (or even bunch of them together?) manually - this way we're not destroying context as memory grows.

## Problem

`dolly context` shows the last 3 step bodies and the newest log lines; everything older silently falls out of view. 6mq9hmg4 has 29 steps (60KB steps.md) — decisions from steps 1-26 are invisible on pickup. The store is never pruned (2rhqyc8c), so this only gets worse. Areas spread over several tasks (install targets: qfcm3sn9 pi, twjnrqcd opencode, 6qp6wxbq zcode, jrtt5pfd, 3txgk3jx) each hold a fragment; no single place says what is true about the area. User: "compact long tasks (or even bunch of them together?) manually - this way we're not destroying context as memory grows."

## Goal

Human-triggered, agent-written compaction. `dolly compact <ref>` prints the task's un-compacted step material plus writing instructions; the agent writes a rollup; `--save` appends it to steps.md as a rollup block and moves the covered step bodies verbatim into `context/steps.compacted.md`. `dolly context` then shows the rollup plus the recent steps, so nothing decided early is lost from view. `dolly compact --tasks a,b,c --title "<t>"` does the same across tasks into `.dolly/digests/<slug>.md`; covered tasks carry `digest:`, the board folds finished covered tasks under it, and context/related point at it. Nothing is deleted and dolly never writes the prose itself.

## Scope

**In:**
- rollup block `<!-- dolly:rollup NNNN -->` (its own number in the step sequence) in steps.md, covering steps a..b; the covered blocks (and any earlier rollup) move verbatim to `context/steps.compacted.md`
- step numbering counts blocks in both files — no number is ever reused
- `dolly compact [ref] [--keep N] [--through NNNN] [--save --file f|-]`; print mode ends with the exact save command, `--through` pinned, so a step logged in between stays live
- `dolly compact --tasks a,b,c --title "<t>" [--save --file f|-]`; `dolly digest [slug]` lists / shows digests
- context: newest rollup rendered before the recent steps; one-line nudge when ≥10 step bodies are neither shown nor rolled up
- `TaskMeta.digest` round-trips; board folds covered tasks in the done status under their digest; context/related name the digest
- log line in task.md for every compaction / digest
- recall + related + `filesOfTask` read steps.compacted.md too
- MCP `dolly_compact` (print + save)
- store v7 (bump lands with the store-cleanup task); skill + README

**Out:**
- automatic or size-triggered compaction (a nudge only)
- dolly generating summary text — no model
- deleting step bodies or rewriting task.md log lines
- an un-compact command (moved blocks are verbatim; git revert undoes it)
- digests of digests

## Success Criteria

- [ ] compact a 29-step task with `--keep 3`: steps.md holds 1 rollup + 3 step blocks; steps.compacted.md holds the 26 blocks byte-identical to before
- [ ] the next `dolly step` on it is number 31 (29 steps + rollup 30), never a reused number
- [ ] `dolly context` shows the rollup then the last 3 steps and none of the compacted bodies
- [ ] save refuses: empty prose, `--through` past the newest step or inside the kept window, nothing to compact
- [ ] re-compaction leaves one live rollup; the old one moved aside with the steps
- [ ] interrupted save (compacted file written, steps.md not) → re-running save converges, no duplicated blocks
- [ ] group: digests/<slug>.md has covers + prose; each covered task has `digest:` + log line; board folds done covered tasks; `dolly digest` lists it
- [ ] `dolly recall` finds text that now lives only in steps.compacted.md, with that file's path:line
- [ ] `dolly_compact` over MCP; footprint tests green; npm test green

## Changes

- `src/core/compact.ts` (new) — material builder, range selection, save (append-compacted-first, idempotent by block id), digests
- `src/core/task.ts` — numbering over both files, `stepEntries` with compacted option, rollup accessor, `compactedFile()`
- `src/core/types.ts` + `store.ts` — `TaskMeta.digest`, parsed in `readTaskDir`, emitted by `metaToFront`
- `src/core/render.ts` — rollup in context, nudge, board fold, digest pointers
- `src/core/related.ts` — files/backlinks over compacted steps
- `src/cli.ts` — `compact`, `digest`, FLAGS, `writesStore`, help
- `src/mcp.ts` — `dolly_compact`
- `skills/dolly/SKILL.md`, `README.md`, `tests/compact.test.mjs`

## Risks

- Teammate appends steps on another branch while one compacts → numbering is max over both files; the range is explicit, so their step stays live after merge.
- Weak rollup prose → originals kept verbatim and searchable; re-compaction can replace it.
- Crash mid-save → compacted file appended first, steps.md second; save skips blocks already in the compacted file, so a retry converges.
- Old dolly on a v7 store would drop `digest:` and miscount steps → version bump; existing gate refuses its writes.
- Hand-merged steps.md with a duplicated block id → refuse, never guess (same rule as setBlock).

## Test Plan

- Unit: range selection (`--keep`, `--through`, bounds), numbering after compaction, byte-identical move, idempotent retry, re-compaction, digest frontmatter round-trip.
- Integration (CLI on tmp store): print → save loop, refusals, group digest + board fold, context render, recall into compacted file, MCP `dolly_compact`.
- Manual: in a copy of this repo's store, compact 6mq9hmg4 and read `dolly context 6mq9hmg4`.

## Open Questions

- [x] Fate of compacted step bodies? → moved verbatim to context/steps.compacted.md (Q&A)
- [x] Where do multi-task digests live? → .dolly/digests/<slug>.md (Q&A)
- [x] MCP budget? → raise to 9000 bytes (Q&A)

## Q&A

**Q (2026-10-20 10:42Z):** One long task: what happens to the original step bodies when compacted?

**A:** Move originals aside: agent-written rollup entry appended to steps.md covering steps a..b; the covered step bodies move verbatim to context/steps.compacted.md (recall still searches it). steps.md shrinks; nothing deleted.

**Q (2026-10-20 10:42Z):** Several tasks compacted together: where does the digest live?

**A:** digests/ dir: .dolly/digests/<slug>.md with covers: [ids]; covered tasks get digest: in frontmatter. Board folds them under the digest; context/related/recall point at the digest first. Tasks stay intact.

**Q (2026-10-20 10:42Z):** MCP tool budget (7549/8000 used)?

**A:** Raise the asserted budget to 9KB; add tools as-is.

