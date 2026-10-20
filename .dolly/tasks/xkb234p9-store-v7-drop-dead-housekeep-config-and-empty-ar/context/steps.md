<!-- dolly steps · task xkb234p9 · append-only, newest at the bottom -->
# Full step context — Store v7: drop dead housekeep config and empty archive dir

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001 -->
## 0001 · 2026-10-20T10:52:06Z · @nick-delirium

- task status: working
- files: `src/migrate.ts`, `src/core/types.ts`, `tests/migrate.test.mjs`

## v7 migration

- `STORE_VERSION` 6 → 7 (`src/core/types.ts`). The bump is deliberately shared with compaction (29kmjsgt): v7 is where step bodies may move to `context/steps.compacted.md` and tasks carry `digest:` — a v6 dolly numbers steps from steps.md alone and `metaToFront` drops unknown frontmatter, so it must be gated out by the version check. Compaction adds no further bump.
- Migration `to: 7`, `safe: true` (auto-applied): removes `DEAD_CONFIG_KEYS = ['housekeep']` from config.json via `readJsonForUpdate` + `writeJson` (unparseable config throws, never replaced), and removes `archive/` only when no file lives anywhere under it (`.DS_Store`/`.gitkeep` ignored). An archive holding any other file is left alone.
- Why the empty dir survived: v5 `flattenArchives` only `rmrf`s after moving task dirs, and detect() only fires when task dirs exist — an already-empty archive never triggered it.
- `.dolly/archive/` here was never in git (empty dir), so only config.json shows in the diff.

Tests: two in `tests/migrate.test.mjs` — auto-migrate on a v6 store with housekeep + empty archive (incl. .DS_Store and an empty bucket); archive with a real file kept. Suite 287/287.
<!-- /dolly:step 0001 -->
