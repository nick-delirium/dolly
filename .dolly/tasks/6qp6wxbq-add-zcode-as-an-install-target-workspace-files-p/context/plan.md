<!-- dolly plan · created 2026-08-30T19:42:35Z · @nick.delirium -->
# Plan — Add zcode as an install target: workspace files + plugin-carried hooks

> Interview record. Every section below must be answered before `dolly plan finalize`.
> Gate: `dolly plan check` fails while a section is empty, `_TBD_`, or an Open Question is unchecked.

## Brief

User wants dolly integrated with zcode (the ZCode ADE client), chose Option A: repo-shared workspace files (.zcode/skills, .zcode/commands, .zcode/config.json mcp.servers, AGENTS.md block) plus a zcode plugin carrying the SessionStart (context injection) and Stop (auto-log) hooks, since workspace-level hooks are ignored by zcode in this version.

## Problem

dolly installs into Claude Code, pi, and opencode, but zcode users only get the generic AGENTS.md block: no skills, no slash commands, no MCP, and none of the ambient behavior (session-start context injection, per-turn auto-log). Root cause: zcode ignores workspace-level hooks entirely in this version (config_project_hooks_ignored) — the exact mechanism every other harness target relies on. Hooks only load from user config or plugins.

## Goal

After `dolly install zcode`, a zcode session in that repo is fully dolly-native: repo-shared .zcode/skills + .zcode/commands + mcp.servers entry, plus a minimal plugin (SessionStart context injection incl. re-fire on compact, Stop auto-log) scaffolded under ~/.zcode/marketplaces/dolly/ with printed one-step marketplace instructions. Teammates cloning the repo get skills/commands/MCP free; each user installs the plugin once.

## Scope

In: src/install.ts zcode TARGET (detect + install), command converter for zcode (rewrite !`cmd` to fenced bash like pi, and ${ARGUMENTS:-x} to $ARGUMENTS — zcode has no conditional-default syntax; dolly CLI already defaults empty refs to current), MCP writer producing .zcode/config.json mcp.servers.dolly with STRING command + args array (array form crashes zcode settings UI), plugin scaffold (.zcode-plugin/plugin.json + hooks/hooks.json with process-type hooks), stop-stdin payload aliases + session env alias, README agents-table row, tests.
Out: --global hooks-in-config fallback, publishing to any remote marketplace, zcode transcript parsing for reindex (no documented on-disk format), compaction hook (SessionStart fires on compact via matcher — covered for free).

## Success Criteria

- [ ] fresh repo: dolly install zcode writes .zcode/skills/dolly/SKILL.md + dolly-planning/, .zcode/commands/dolly-*.md free of !` and ${:- forms, merges .zcode/config.json adding mcp.servers.dolly {command: "dolly", args: ["mcp"], enabled: true} without touching existing keys, writes AGENTS.md block
- [ ] plugin scaffold at ~/.zcode/marketplaces/dolly/ validates: plugin.json name matches ^[a-z0-9][a-z0-9._-]{0,127}$, hooks/hooks.json uses the plugin outer-hooks wrapper, hooks are process-type
- [ ] dolly hook stop --from-stdin fed zcode-shaped payloads (session_id, response-preview field names) never errors; logs a step when fields present
- [ ] session-start hook output is the hookSpecificOutput.additionalContext JSON both Claude Code and zcode accept
- [ ] idempotent rerun changes nothing; detect() fires when .zcode/ or ~/.zcode exists
- [ ] full suite + tsc clean

## Changes

src/install.ts: ZCODE_PLUGIN template + zcode TARGET (copyTree skills, converted commands, MCP writer, plugin scaffold writer, detect). Command conversion: reuse toPiPrompt body + rewrite ${ARGUMENTS:-X} -> $ARGUMENTS. src/cli.ts: stop-stdin aliases (session_id, response/text variants). src/core/session.ts: accept CLAUDE_SESSION_ID alongside existing env names. src/core/fsx: nothing new. tests/install.test.mjs + tests/hooks.test.mjs: new cases. README.md: agents table row + install docs.

## Risks

- Stop payload schema undocumented beyond response-preview: mitigated by tolerant adapter + silent no-op; verify in a real session after install.
- marketplace.json exact entry shape could be off -> plugin not visible in Discover tab; follow documented {name, plugins[].source} and verify manually.
- hook cwd: Claude-compatible clients run hooks with cwd=project dir; if zcode differs, session-start finds no store and exits clean (existing behavior) — detect during manual verify.
- strict hook-output JSON schema: emit exactly hookSpecificOutput/hookEventName/additionalContext, no extra keys.
- ~/.zcode/marketplaces/ is a dolly-chosen path inside zcode config home (not documented as reserved): acceptable, uninstall = delete dir.

## Test Plan

Unit: converter rewrites !`cmd` and ${ARGUMENTS:-x}, keeps $ARGUMENTS; MCP writer shape + existing-key preservation; plugin manifest JSON validity + name regex + hooks wrapper shape; stop-stdin aliases. Integration: fresh-repo install idempotency; detect() cases. Manual (real zcode): add local marketplace, Get dolly, new session -> context injected; finish a turn -> mechanical step appears on active task.

## Open Questions

- [x] Plugin install mechanism — answered: scaffold local marketplace + one UI step (Q&A logged)
- [x] Stop payload handling in v1 — answered: tolerant adapter, silent no-op on unknown shapes (Q&A logged)
- [x] Component scope — answered: workspace .zcode/ for skills/commands/MCP, plugin minimal hooks-only (Q&A logged)

## Q&A

**Q (2026-08-30 19:44Z):** How does the dolly plugin get installed into zcode, given plugins only install via marketplaces?

**A:** Scaffold + one UI step: dolly install zcode writes the plugin under ~/.zcode/marketplaces/dolly/ and prints instructions to add that folder as a local marketplace (Settings > Discover > +) and click Get on dolly. No config-file hooks fallback in v1.

**Q (2026-08-30 19:44Z):** Ship Stop-hook auto-log in v1 when the payload shape is only partially documented?

**A:** Yes — tolerant adapter: dolly hook stop --from-stdin accepts the zcode payload (aliases for session/text fields), missing fields degrade to a less-detailed mechanical entry, unknown shapes exit 0 silently. Never errors.

**Q (2026-08-30 19:44Z):** Where do skills, commands, and the MCP entry live?

**A:** Workspace .zcode/ — repo-committed so teammates get them on checkout with no install. The plugin stays minimal: SessionStart + Stop hooks only.

