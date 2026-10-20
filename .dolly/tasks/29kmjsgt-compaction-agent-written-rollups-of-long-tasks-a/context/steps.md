<!-- dolly steps · task 29kmjsgt · append-only, newest at the bottom -->
# Full step context — Compaction: agent-written rollups of long tasks and task groups

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001 -->
## 0001 · 2026-10-20T11:14:55Z · @nick-delirium

- task status: working
- files: `src/core/compact.ts`, `src/core/digest.ts`, `src/core/task.ts`, `src/core/types.ts`, `src/core/store.ts`, `src/core/render.ts`, `src/core/related.ts`, `src/core/recall.ts`, `src/reindex.ts`, `src/cli.ts`, `src/mcp.ts`, `skills/dolly/SKILL.md`, `README.md`, `tests/compact.test.mjs`, `.claude/skills/dolly/SKILL.md`, `.opencode/skills/dolly/SKILL.md`

## Compaction — whole task, one slice

### Shape on disk (schema v7, bump landed in xkb234p9)
- `context/steps.md`: live step blocks + ONE live `&lt;!-- dolly:rollup NNNN -->` block. Rollup header: `## NNNN · stamp · @user`, `- covers: steps 0001–0026`, `- moved: \`steps.compacted.md\``, then the agent's prose.
- `context/steps.compacted.md`: covered blocks (and any superseded rollup) moved byte-for-byte, own header.
- `.dolly/digests/<slug>.md`: frontmatter (slug, title, covers, created, updated, by), Covers line, `&lt;!-- dolly:digest -->` current prose, `&lt;!-- dolly:digest-history -->` previous versions newest first.
- `TaskMeta.digest` (frontmatter `digest:`), parsed in readTaskDir, emitted by metaToFront.

### Where the code is
- `core/task.ts` (owns task writes): `compactedFile()`, `nextStepNumber(task)` = max(counter, step+rollup blocks in BOTH files)+1 — now used by addStep; `rollupEntries()`; `stepEntries(dir, {compacted})`; `addRollup()` (compacted file written FIRST, skipping ids it already holds → crash between the two writes converges on retry); `setDigest()`.
- `core/compact.ts`: `planCompaction(task, {keep, through})` (refuses duplicate ids, `--through` inside kept window, nothing to do), `rollupMaterial`, `saveRollup`, `checkDigestTasks` (≥2 tasks, one digest per task), `digestMaterial`, `saveDigest` (file first, then stamps; identical re-save adds no history entry).
- `core/digest.ts`: read side only (`listDigests`, `readDigest`, `digestFile`) — split out so render.ts can read digests without importing compact.ts (which imports render's compactStep → would be a cycle).
- Readers that must see moved bodies: `filesOfTask`, `why`, `mentionedBy`, recall (weight 0.6, label "(compacted)"), reindex `importedTurns` (else a re-run would import compacted turns again). `recentStepDetails` deliberately does NOT (context shows live only).
- Render: context shows newest rollup (also in --brief) before the last N steps; nudge when ≥10 live bodies unseen (`COMPACT_NUDGE`); digest pointer line; board folds DONE tasks with `digest:` into one `⧉ <title>  N tasks · dolly digest <slug>` line; `renderRelated` shows `· digest <slug>`.
- CLI `compact` / `digest`; `writesStore` = compact --save. MCP `dolly_compact` (save → lock).

### Decisions
- "Move originals aside" (user's choice over keep-in-place / delete): steps.md shrinks; the append-only invariant now reads "never edited or deleted; compaction relocates verbatim".
- `--through` pinned at print time so a step logged between print and save stays live (test covers it).
- Re-compaction: new rollup's `from` inherits the old rollup's `from`; old rollup moves aside.
- A task belongs to one digest; re-digesting under another title is refused.

### Numbers
- MCP tool list 8987 bytes vs the 9000 budget (trimmed both new tools' schema text from 9159). Next tool needs a budget call.
- Smoke on a scratch copy of this repo's store: 6mq9hmg4 (14 live bodies) → 11 moved, all byte-identical; digest of qfcm3sn9,twjnrqcd,6qp6wxbq folds the 2 done ones on the board.

### Not done
- Did NOT compact anything in the real store — that is the human's call.
<!-- /dolly:step 0001 -->

<!-- dolly:step 0002 -->
## 0002 · 2026-10-20T11:27:34Z · @nick-delirium

- task status: validating
- files: `src/core/task.ts`, `src/core/compact.ts`, `src/reindex.ts`, `src/core/args.ts`, `src/cli.ts`, `src/mcp.ts`, `tests/compact.test.mjs`, `tests/reindex.test.mjs`

## Review fixes (independent reviewer pass over the whole diff)

- **Body loss on id collision (bug):** `addRollup` skipped a block when its *marker* already existed in steps.compacted.md, then removed the live one → a merged branch's different body with the same number vanished from both files. Now: identical text = retry (skip), different text = refuse before writing anything. Test: "a compacted id that collides with a different live body is refused, and nothing moves".
- **Reindex duplicated a compacted import (bug):** `findImportedTask` (reindex.ts) only read steps.md; once imported blocks moved, `reindex --apply` created a second task and re-imported every turn. Reads `stepEntries(dir, {compacted:true})` now. Test in reindex.test.mjs.
- **Save widened the range:** `saveRollup` re-planned at save time when `--through` was omitted, covering a step logged after the material was printed. `through` is now required in core, CLI and MCP.
- **`num()` swallowed typos:** `--keep abc` / `--limit abc` silently became the default. args.ts `num()` now throws ArgError `--keep takes a number, not "abc"` (applies to every numeric flag).
Lesson: the suite passed all four before; each now has a test.
<!-- /dolly:step 0002 -->
