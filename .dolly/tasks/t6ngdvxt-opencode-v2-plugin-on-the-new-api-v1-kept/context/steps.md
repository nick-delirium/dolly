<!-- dolly steps · task t6ngdvxt · append-only, newest at the bottom -->
# Full step context — opencode v2: plugin on the new API, v1 kept

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001-nick-delirium -->
## 0001 · 2026-11-20T09:43:17Z · @nick-delirium

- task status: working
- files: `plugins/opencode.js`, `src/install.ts`, `package.json`, `README.md`, `tests/opencode-plugin.test.mjs`, `tests/install.test.mjs`, `src/core/dream.ts`, `tests/dream.test.mjs`, `AGENTS.md`

## Findings (opencode v2.3.x, from @opencode/plugin 2.3.2 types + opencode.ai/v2 docs)
- v2 reads the DEFAULT export's `id` + `setup(ctx)`; `Plugin.define` is the identity function, so a plain object works with no dependency. v1 (opencode-ai on npm is still 1.19.x) reads default `{ id, server }` and falls back to legacy named function exports.
- v1 → v2 hook map used: `experimental.chat.system.transform` → `ctx.session.hook("context", e => e.system.push({type:"text", text}))` (runs before every agent-loop request, after compaction too — so no compaction hook needed); `chat.message` → `hook("prompt")` (e.sessionID); `event` session.idle → `hook("experimental.idle")` (e.sessionID), with `ctx.event.subscribe` + `event.type === "session.idle"` as fallback; `client.session.messages({path})` → `ctx.session.context({ sessionID })`.
- v2 messages: user `{id, type:"user", text, time.created}`, assistant `{id, type:"assistant", content:[{type:"text",text} | {type:"tool", name, state:{input}}]}`. `normalizeMessage` maps v1 `{info, parts}` and v2 to one shape.
- `command.execute.before` (display-only `direct: true` commands) has no v2 equivalent: v1 only; on v2 those commands go through the model.
- Still valid on v2, unchanged: `.opencode/commands/*.md` with !`cmd`, `.opencode/skills/`, `.opencode/plugins/`, AGENTS.md, and the v1 `mcp.dolly {type, command, enabled}` entry (v2 normalizes v1 config in memory; native v2 is `mcp.servers.<name>` with `disabled`).

## Changes
- `plugins/opencode.js` (new, shipped; package.json files += plugins/): shared core (async `dolly` exec that always closes stdin, normalizeMessage, finishTurn mirror + stdin pipe, per-session turn start), v1 `DollyPlugin` with a per-directory guard (v1 may find it via both server() and the named export), v2 `setup`. `export default { id: "dolly", setup, server: DollyPlugin }`.
- install.ts: the 300-line template string is gone; `opencodePlugin()` reads the shipped file.
- tests/opencode-plugin.test.mjs: drives v2 setup (hooks registered, context injected, idle auto-logs + mirrors, refire is a no-op, event-stream fallback), v1 server() (hooks, single registration, idle via client.session.messages), and a missing dolly binary on both.

## Also this turn
- Refreshed this repo's AGENTS.md (was teaching `dolly related --files`) and .opencode/ (dolly-memo.md removed, dolly-dream.md added, skill + plugin current) via `dolly install opencode`.
- dream.ts: dream prose headings stay `###` under the block's `##` (were demoted to ####).

## Not verified
No opencode binary here: the plugin is tested against fake hosts built from the published v2 types, not a live opencode v2.
<!-- /dolly:step 0001-nick-delirium -->
