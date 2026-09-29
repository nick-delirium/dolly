<!-- dolly steps · task rqdpztdy · append-only, newest at the bottom -->
# Full step context — Auto-log targets this session's task; lock store writes

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001 -->
## 0001 · 2026-09-29T14:34:35Z · @nick-delirium

- task status: working
- files: `src/core/lock.ts`, `src/core/session.ts`, `src/core/store.ts`, `src/core/task.ts`, `src/cli.ts`, `src/mcp.ts`, `src/install.ts`, `bin/dolly-hook.mjs`, `tests/autolog-target.test.mjs`, `tests/hooks.test.mjs`, `tests/install.test.mjs`, `README.md`, `skills/dolly/SKILL.md`

## Auto-log targeting + store lock (whole task, one slice)

Root cause of the recurring "landed here by mistake via step current" (5nbx4mdy, jd8s6t23, 6qp6wxbq): `currentTask` = most recently updated working task, and the Stop hook auto-logged every session onto it; each auto-step bumped `updated`, so it stayed "current" forever.

- store.ts: `currentTask(tasks, config, {session, user})` — session-linked task first, then tasks you own/collaborate on, then recency; priority statuses from config (reviewStatus) not hard-coded. `sessionTask()` = newest unfinished task whose sessions include the id. `Store.resolve('current')` passes currentSessionId + user.
- cli hook: `hookPayload()` reads harness JSON on stdin (not on a TTY): session from session_id/session/sessionId, env last. `hook stop` targets ONLY `sessionTask` — no session link → no auto-log, no nudge. Claude path uses payload.transcript_path when present.
- `setStatus` same-status/no-note now attaches the session (touch+save) — `dolly status X working` is the documented "pick up" move.
- session boundaries in `.local/sessions.json` (core/session.ts): {at, task, steps} marked at session-start and at the END of every stop (after the auto-step — marking before made the auto-step itself look like an agent step next turn). from-stdin dedup: turnStartMs if given, else steps > boundary.steps for the same task, else updated >= boundary.at.
- core/lock.ts: `.local/write.lock` O_EXCL with pid; dead pid or >120s → cleared; 10s wait then StoreLocked; reentrant; process 'exit' cleanup. Taken in cli main for writesStore(cmd) (not setup/init — interactive), around hook stop, and around MCP write tools. REQUIRED_IGNORES gains `.local/` (safe migration adds it).
- Double hooks: bin/dolly-hook.mjs exits 0 when settings.json/settings.local.json/~/.claude/settings.json already contain `dolly hook <sub>`. install claude: `claudePluginEnabled()` (installed_plugins.json dolly@*, not disabled) → --global skips skills/commands/MCP/hooks; local writes them (teammates) + note.
- pi extension: logs on `agent_end` (once per prompt), turn key = agent_start ms, turnStartMs = agent_start; was turn_end with `turnIndex ?? 0` (resets per prompt → prompt 2 dropped, one step per LLM round).
- opencode plugin: fresh process starts slicing from the newest user message (was 0 → whole history as one turn); turn key = user message id (was position → collided after restart).
- A test caught a real bug: my first pi template had a raw newline in `.join("\n")` inside the TS template literal → generated extension did not parse. Now a test `node --check`s both generated plugins.

Tests: tests/autolog-target.test.mjs (10); hooks.test.mjs now attaches sessions explicitly; install.test.mjs loads the pi extension against a stand-in pi. Suite 276/276.
<!-- /dolly:step 0001 -->
