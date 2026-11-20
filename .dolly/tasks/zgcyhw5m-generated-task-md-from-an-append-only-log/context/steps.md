<!-- dolly steps · task zgcyhw5m · append-only, newest at the bottom -->
# Full step context — Generated task.md from an append-only log

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001-nick-delirium -->
## 0001 · 2026-11-20T09:34:00Z · @nick-delirium

- task status: working
- files: `src/core/log.ts`, `src/core/task.ts`, `src/core/store.ts`, `src/core/compact.ts`, `src/core/related.ts`, `src/core/types.ts`, `src/migrate.ts`, `src/cli.ts`, `src/mcp.ts`, `README.md`, `tests/log.test.mjs`, `tests/helpers.mjs`, `tests/task.test.mjs`, `tests/compact.test.mjs`, `tests/integrity.test.mjs`, `tests/migrate.test.mjs`, `tests/reindex.test.mjs`, `tests/footprint.test.mjs`, `.dolly/project.md`

## What exists now (store v8)
- `src/core/log.ts`: `log.jsonl` per task. Event = `{v,at,by}` + any of `base` (first line: meta + verbatim body) · `set` (scalar meta, tags) · `add` (collaborators, sessions) · `inc` (steps, spec_version — summed) · `lead` / `sec` (raw section text) · `log` (text appended to Log) · `body` (whole body, fallback). `readEvents`: earliest base, then the rest stable-sorted by `at`. `fold` → meta + body (header block re-rendered). `diffEvent(prev, next)`.
- `task.ts saveTask(task, by?)`: with a log → diff against the fold, self-check `fold([...events, e])` reproduces the writer's body (else drop lead/sec/log, use `body`), append, write task.md FROM THE FOLD, update task in place. Without a log → old path (only for tasks the migration refused / pre-v8 fixtures). `createTask` writes the base event first (`startEventLog`).
- `store.readTaskDir`: log first; task.md parsed only when there is no log.
- Step ids: `stepId(n, user)` = `NNNN-<handle>` for step and rollup blocks and `full:` refs; header line unchanged. `nextStepNumber` uses parseInt. `compact.resolveStepId` (exact id, or bare number → unique / current user's / error listing). Rollup "covers" and messages show numbers only; `--through` printed with the full id.
- `assertOneSection` guard removed (task.md is never parsed back; content headings are demoted on write anyway).
- v8 migration (safe → auto): start a log per task (body verbatim; refused when frontmatter carries an unknown key or a section is duplicated — reported, left on task.md), render in the same run, add `.dolly/.gitattributes` (union for log.jsonl, task.md, steps.md, dreams), drop the dead `memo` config key. Its detect ALSO re-renders any task.md that differs from (or is missing beside) its log — that is how a merge's garbled task.md heals on the next command. No `dolly render` command: the auto-migration does it (kept the surface at 26).

## Verified
- This repo's store: 30/30 tasks migrated; `git diff` of existing task files unchanged by it; session-start ~90–140ms on the migrated copy.
- tests/log.test.mjs: event shapes (step = inc+log only), deleted/corrupted task.md rebuilt byte-identical + idempotent, concatenated-logs merge (steps summed, both entries, distinct ids, bare-number resolution, ambiguity error, next number unused), a REAL git merge of two branches → exit 0 and correct fold, migration lossless + custom-key refusal + writes go through the log afterwards.

## Test churn (format only, behavior same)
Assertions on new step ids now expect `-tester`; `ageTask` helper backdates through the log; migrate fixtures delete log.jsonl to stand in for pre-v8 tasks; v7 auto-migrate test expects STORE_VERSION; the duplicate-## Log integrity test now asserts the opposite (corruption is ignored and healed).

## Gotchas
- `Number('0013-alice')` is NaN — any new code reading block ids must parseInt.
- A first log entry replaces the `_no steps yet_` placeholder, so it is a `sec` op, not a `log` append; later steps are pure appends (what merges cleanly).
- Older dolly (v7) reading a v8 store still works (task.md is still there) but writes are refused by the version gate — teammates must upgrade.
<!-- /dolly:step 0001-nick-delirium -->
