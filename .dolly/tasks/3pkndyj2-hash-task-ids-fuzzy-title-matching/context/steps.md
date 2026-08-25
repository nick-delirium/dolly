<!-- dolly steps · task 3pkndyj2 · append-only, newest at the bottom -->
# Full step context — Hash task ids + fuzzy title matching

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001 -->
## 0001 · 2026-08-25T16:49:16Z · @nick.delirium

- task status: working
- files: `.claude/commands/dolly/housekeep.md`, `.opencode/commands/dolly-adopt.md`, `.opencode/commands/dolly-board.md`, `.opencode/commands/dolly-housekeep.md`, `.opencode/commands/dolly-plan.md`, `.opencode/commands/dolly-resume.md`, `.opencode/commands/dolly-spec.md`, `.opencode/commands/dolly-step.md`, `.opencode/commands/dolly-update.md`, `.opencode/commands/dolly-validate.md`, `.opencode/plugins/dolly.js`, `.opencode/skills/dolly-planning/SKILL.md`, `.opencode/skills/dolly/SKILL.md`, `AGENTS.md`, `README.md`, `commands/board.md`, `commands/housekeep.md`, `opencode.json`, `skills/dolly/SKILL.md`, `src/cli.ts`, `src/core/fuzzy.ts`, `src/core/housekeep.ts`, `src/core/related.ts`, `src/core/render.ts`, `src/core/store.ts`, `src/core/task.ts`, `src/core/transcript.ts`, `src/core/types.ts`, `src/install.ts`, `src/mcp.ts`, `src/migrate.ts`, `src/prompt.ts`, `src/reindex.ts`, `src/templates/instructions.ts`, `src/wizard.ts`, `tests/fuzzy.test.mjs`, `tests/hooks.test.mjs`, `tests/housekeep.test.mjs`, `tests/install.test.mjs`, `tests/migrate.test.mjs`, `tests/picker.test.mjs`, `tests/project.test.mjs`, `tests/reindex.test.mjs`, `tests/store-index.test.mjs`, `tests/task.test.mjs`, `tests/transcript-opencode.test.mjs`, `tests/version.test.mjs`, `tests/wizard.test.mjs`

## What landed

- **src/core/fuzzy.ts** (new): fzy-style subsequence scorer — boundary/camel bonuses,
  consecutive-run bonus, gap start/extension penalties; leading chars mildly penalized.
  fuzzyBest() convenience over title+slug.
- **store.ts**: nextId() → random 8-char from ID_ALPHABET ('23456789bcdfghjkmnpqrstvwxyz',
  no vowels/ambiguous glyphs), collision-regenerated. New search(ref) ranks candidates:
  title-prefix > slug-prefix > title-substring > slug/rel-substring > fuzzy(≥30 threshold).
  resolve() throws AmbiguousRef (typed error carrying ranked candidates) instead of a
  plain message when several tasks match. readTaskDir parses dir names as <id>-<slug>
  for hashes too (split on first dash).
- **prompt.ts**: filterSelect — type-to-filter picker; raw mode live-filters with
  ↑↓/enter/esc/backspace, prefilled with the query that caused the ambiguity;
  numbered list fallback without raw mode.
- **cli.ts**: resolveRef(store, ref) wraps store.resolve — catches AmbiguousRef,
  opens filterSelect in a TTY, prints numbered candidates to stderr + fails in scripts.
  Ten commands route through it (show/context/current/step/spec/status/retitle/
  related/plan/reindex --into/continue); they went async, dispatch awaits them.
- **migrate.ts v6**: numeric ids → hashes. Renames dirs, rewrites frontmatter via
  saveTask, rewrites machine markers only (task.md heading `# <id> ·`, steps/spec
  header comments) — prose left alone (it is history). rewriteIdReferences exported
  for tests.

## Gotchas

- Tests everywhere assumed sequential ids ('1', '0001', insertion-order arrays).
  All rewritten to use captured meta.id / loadTasks()[0]. Recency ties in
  project.test needed ageTask() backdating because id tie-breaks are random now.
- The cli.ts file got wiped by a bad scripted edit mid-task; rebuilt from git HEAD
  by replaying this session's three edit sets (see commit history of my mistakes).
- filterSelect's numbered fallback ignores the query (lists everything) — fine
  for scripts, which should parse the stderr candidate list anyway.

## Not done here

- MCP tools keep plain resolve() semantics (throws ambiguity text) — agents parse text,
  pickers are for humans.
<!-- /dolly:step 0001 -->
