<!-- dolly spec · task qfcm3sn9 -->
# Spec — support pi as an install target

**current: v2** · updated 2026-08-07T19:36:09Z by @rjshrjndrn · superseded versions are kept at the bottom of this file

<!-- dolly:spec-current -->
<!-- v2 · 2026-08-07T19:36:09Z · @rjshrjndrn -->

# support pi as an install target

## Problem

dolly installs into 8 agents (claude, codex, cursor, windsurf, copilot, gemini, opencode, agents) but not pi. We develop dolly *in* pi, so `dolly install` cannot wire dolly into its own primary harness — no skill, no MCP registration for pi without manual steps.

## Goal

`dolly install` detects a pi installation and wires dolly into it the same way it does Claude Code (minus hooks): copies the dolly + dolly-planning skills, writes the AGENT_BLOCK instructions, and registers the MCP server in pi's config. Running dolly under pi then gets the skill and the dolly_* MCP tools with zero manual setup.

## Scope

In:
- New 'pi' Target in src/install.ts TARGETS[] (detect + install).
- copyTree of skills/dolly and skills/dolly-planning into <base>/skills.
- writeBlock(AGENT_BLOCK) into pi instructions (SYSTEM.md global / AGENTS.md repo).
- mergeMcpJson into pi config (~/.pi/agent/mcp.json global / .mcp.json repo).
- cleanLegacy call for parity/idempotency.
- Tests for detect + install (dry-run output + written artifacts).

Out:
- pi hook extension (extensions/dolly.ts, session_start auto-inject + turn_end auto-log) — separate follow-up task.
- pi commands/prompts wiring (format unconfirmed).
- Any change to pi itself.

## Success Criteria

- [ ] `dolly install` lists 'pi' as a detected target when ~/.pi/agent exists.
- [ ] Installing writes skills/dolly and skills/dolly-planning under the pi base.
- [ ] Installing writes the AGENT_BLOCK instruction block into the pi instruction file.
- [ ] With --mcp, a 'dolly' entry is merged under mcpServers in pi's mcp config.
- [ ] Re-running install is idempotent (reports up-to-date, no dupes).
- [ ] Unit tests cover detect true/false and install artifacts, all green via `make test`.

## Changes

- src/install.ts — add pi Target to TARGETS[] (detect, install: skills+instructions+mcp), extend cleanLegacy base if needed. [primary]
- tests/install.test.ts (or existing install test file) — new cases for pi detect + install. [guess: confirm test file path]
- No template changes: reuses AGENT_BLOCK, MCP_SERVER, mergeMcpJson, copyTree, writeBlock.

## Risks

- pi skills only load from global ~/.pi/agent/skills; a repo-scoped (non-global) install may write skills pi never reads. Mitigate: document that pi target favors --global, mirror claude's base logic anyway.
- pi instruction discovery (SYSTEM.md vs AGENTS.md) assumed; if wrong, instructions silently ignored. Low blast radius — MCP + skill still work.
- mcp.json shape assumed {mcpServers:{command,args}}; verified against live file.

## Test Plan

Unit (make test):
- detect returns true when ~/.pi/agent exists, false otherwise (use a temp HOME/base).
- install dry-run lists expected skill/instruction/mcp lines.
- install (real, temp dir) creates skills dirs, writes instruction block, merges mcpServers.dolly.
- second install run is idempotent (no dupes, up-to-date messages).
Manual:
- `dolly install` in this repo, confirm pi detected; restart pi, confirm dolly_* MCP tools + skill available.

## Open Questions

- [x] pi hook support? → yes (session_start/turn_end), deferred to follow-up per scope (b).
- [x] pi install paths (mcp/skills/instructions)? → resolved from live ~/.pi/agent + claude target convention.
- [x] MCP global vs repo + detect predicate? → mirror claude; detect isDir(~/.pi/agent).
- [x] Test file location? → tests/install.test.mjs (node test runner).
- [x] Repo-scoped vs global pi skills? → decided: pi target favors --global; base mirrors claude regardless. Verify in manual test (tracked in Risks/Test Plan).

## Decisions (from planning Q&A)

**Q (2026-08-07 19:29Z):** Does pi support lifecycle hooks like Claude's SessionStart/Stop?

**A:** Yes. pi extensions (~/.pi/agent/extensions/*.ts) expose pi.on('session_start') and pi.on('turn_end'), plus before_agent_start/tool_result/context/session_shutdown. session_start can mutate systemPrompt (auto-inject); turn_end fires per finished turn (auto-log). Extension is a .ts file using @mariozechner/pi-coding-agent ExtensionAPI.

**Q (2026-08-07 19:29Z):** Where do dolly artifacts install for pi?

**A:** MCP: ~/.pi/agent/mcp.json (global, {mcpServers:{command,args}}) — same shape as .mcp.json which repo already has. Skills: ~/.pi/agent/skills/<name>/SKILL.md. Instructions: repo AGENTS.md (dolly 'agents' target already writes it) or global SYSTEM.md. Commands: ~/.pi/agent/prompts/ (commands/ dir empty, format unconfirmed). Hooks: extensions/dolly.ts.

**Q (2026-08-07 19:30Z):** MVP scope of the pi target?

**A:** Scope (b): write MCP server into pi config + copy the dolly-planning skill into ~/.pi/agent/skills/. No hook extension in v1 — auto-inject/auto-log via extensions/dolly.ts deferred to a follow-up task.

**Q (2026-08-07 19:31Z):** MCP global vs repo, and detect predicate?

**A:** Mirror the claude target: global→~/.pi/agent/mcp.json, repo→project/.mcp.json, key 'mcpServers' (verified pi uses this key). detect = isDir(~/.pi/agent).

**Q (2026-08-07 19:31Z):** Instructions — reuse AGENT_BLOCK?

**A:** Yes. writeBlock(AGENT_BLOCK) → global ~/.pi/agent/SYSTEM.md else repo AGENTS.md. Same block every other target uses; setBlock is idempotent so codex also writing AGENTS.md is fine.

**Q (2026-08-07 19:35Z):** Where do install tests live and what runner?

**A:** tests/install.test.mjs — node built-in test runner (.mjs), run via make test. New pi cases go there; check tests/helpers.mjs for temp-dir/HOME fixtures.
<!-- /dolly:spec-current -->

---

## Superseded versions

<!-- dolly:spec-history -->
## v1 — 2026-08-07T19:27:58Z · @rjshrjndrn

> superseded by v2: planning finished — spec derived from plan.md

# support pi as an install target

_Spec is being written by the planning interview. See `plan.md`._
<!-- /dolly:spec-history -->
