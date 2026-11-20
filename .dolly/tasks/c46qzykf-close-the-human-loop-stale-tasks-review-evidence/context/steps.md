<!-- dolly steps · task c46qzykf · append-only, newest at the bottom -->
# Full step context — Close the human loop: stale tasks, review evidence, backlog age

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001 -->
## 0001 · 2026-11-20T09:02:04Z · @nick-delirium

- task status: working
- files: `src/core/store.ts`, `src/core/types.ts`, `src/core/render.ts`, `src/core/git.ts`, `src/review.ts`, `src/cli.ts`, `tests/autolog-target.test.mjs`, `tests/git.test.mjs`, `tests/footprint.test.mjs`

## What exists now
- `config.staleDays` (default 14, 0 = off). `isStale(task, config)` (core/store.ts): only active statuses (working/validating/planning) can be stale — a todo is a backlog, not idle.
- `currentTask` fallback skips stale tasks; a conversation linked to the task (sessionTask) keeps it regardless. `resolve('current')` error names the idle count and the way out (`dolly status <ref> working` re-touches → fresh).
- Session start: no stale task offered; when nothing fresh: "No fresh open task (N idle over 14d — `dolly board`)". The 7-day FRESH_DAYS tier (spec shown or not) is unchanged inside the 14-day window.
- Statusline reads `session_id` from Claude Code's stdin payload, so it shows THIS conversation's task (was: global recency).
- Board: stale working/planning lines show `idle 3mo` in yellow; footer "N awaiting a human, oldest 3mo" and "N open tasks idle over 14d — pick up / shelve" commands.
- Review screen: "Commits" — up to 3 commits naming the task id (trailer or prose, `git log --all --topo-order -F --grep=<id>`), each marked "on origin/main" when reachable from the default branch (`defaultBranch`: origin/HEAD, else main/master). core/git.ts `commitsNaming`, `defaultBranch`.

## Decisions
- No auto-done on merge: a human still closes. The commit evidence is shown where the human decides.
- Validating tasks are excluded from the board's idle count/marker: they're waiting on a human, which the backlog-age line already says.
- `--topo-order`: same-second commits otherwise come back in arbitrary order.

## Not done
- No delete command: junk tasks in this store (rtyjvkbf "README audit test" @tester, jd8s6t23 "autolog smoke test") need a human to close or remove them.
<!-- /dolly:step 0001 -->
