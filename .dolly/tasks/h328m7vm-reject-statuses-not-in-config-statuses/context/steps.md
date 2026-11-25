<!-- dolly steps · task h328m7vm · append-only, newest at the bottom -->
# Full step context — Reject statuses not in config.statuses

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001-nick.delirium -->
## 0001 · 2026-11-25T22:39:49Z · @nick.delirium

- task status: working
- files: `src/core/task.ts`, `src/core/plan.ts`, `src/cli.ts`, `tests/task.test.mjs`, `tests/plan.test.mjs`, `tests/cli-args.test.mjs`

## Root cause
setStatus and addStep already validated against config.statuses, but two write paths did not: createTask (`dolly new --status`, MCP dolly_task_new, reindex --status) and finalizePlan's nextStatus (`dolly plan finalize --status`, MCP dolly_plan finalize). A typo like `in-progress` produced a task that render.ts still shows (it appends unknown statuses to the board), while session-start, auto-log (only `working`), currentTask and review never see it.

## Change
- New `assertStatus(store, status)` in src/core/task.ts — one message format, used by setStatus, addStep, createTask and finalizePlan.
- Only explicitly passed statuses are checked. Built-in defaults (`todo` in createTask/finalize, `working` in reindex) are untouched, so custom configs that omit them behave as before — that is a separate, pre-existing edge.
- cmdNew validates before `store.init()`, so a typo in a fresh repo leaves no `.dolly/` behind. finalizePlan validates before updateSpec, so the spec version is not bumped.

## Verified
- 3 new tests (task, plan, cli-args); all fail on the old code, pass on the new. Suite 368/368.

## Not done
- `dolly review --status` and `dolly board --status` filters still accept any string (read-only; an unknown one just shows nothing).
<!-- /dolly:step 0001-nick.delirium -->
