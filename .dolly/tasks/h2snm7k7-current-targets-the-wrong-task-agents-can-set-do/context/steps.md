<!-- dolly steps · task h2snm7k7 · append-only, newest at the bottom -->
# Full step context — current targets the wrong task; agents can set done

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001 -->
## 0001 · 2026-11-20T08:59:15Z · @nick-delirium

- task status: working
- files: `src/core/store.ts`, `src/cli.ts`, `src/mcp.ts`, `tests/autolog-target.test.mjs`, `tests/mcp.test.mjs`

## Root cause
`sessionTask` (core/store.ts) filtered only `done`, so any task the conversation wrote to — including a `todo` one made by `dolly new` mid-work, which attaches the session — won on recency. Same-second ties then broke by id. Seen in the real store: 5nbx4mdy step "landed here by mistake via 'step current'".

## Decisions
- `sessionTask(tasks, session, config)` now takes config and only considers active statuses (`activeStatuses`: working, reviewStatus, planning). Order: `working` first, then recency among validating/planning. Reason: a working task is what steps are about; a newer planning task started mid-work must not take `step current`. Handing over (validating) then planning the next thing still picks the newer one by recency.
- `currentTask` fallback pool is also restricted to active statuses (it was "not done", which let todo in through recency only via the session path; fallback was already status-ordered).
- Done guard lives at entry points, not in `setStatus` (convention: library functions don't enforce, entry points do; tests call setStatus(..., 'done') directly).
  - CLI `guardDone(store, status)` → uses `notAHuman()` (same predicate review uses): status, step --status, new --status, plan finalize --status, reindex --status.
  - MCP: any WRITE call with `status === doneStatus` is refused (`writesStore` gate — board/recall use `status` as a filter and must keep working).
- Side effect: a human typing `! dolly status x done` inside Claude Code is refused (CLAUDECODE=1). Message tells them to use their own terminal or `dolly review`.

## Tests
tests/autolog-target.test.mjs: todo/planning don't steal current; `step current` lands right; all four CLI paths refuse done under CLAUDECODE=1. tests/mcp.test.mjs: status_set/step_add refuse done; board filter on done still works.
<!-- /dolly:step 0001 -->
