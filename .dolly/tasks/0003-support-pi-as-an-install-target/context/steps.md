<!-- dolly steps · task 0003 · append-only, newest at the bottom -->
# Full step context — support pi as an install target

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001 -->
## 0001 · 2026-08-07T19:45:14Z · @rjshrjndrn

- task status: working
- files: `.gemini/settings.json`, `.pi/git-root.cache`, `.pi/memory.db`, `.pi/memory.db-shm`, `.pi/memory.db-wal`, `.windsurf/rules/dolly.md`, `AGENTS.md`, `GEMINI.md`, `opencode.json`, `package-lock.json`, `src/install.ts`, `tests/install.test.mjs`

## Slice: pi install target (scope b — MCP + skill)

Added a `pi` Target to `TARGETS[]` in src/install.ts, mirroring the
`claude` target minus commands and hooks (both deferred).

Resolved layout (verified against live ~/.pi/agent):
- detect: isDir(~/.pi/agent) || isDir(<project>/.pi/agent)
- base:   global ? ~/.pi/agent : <project>/.pi/agent
- skills: copyTree dolly + dolly-planning → <base>/skills
- instr:  writeBlock(AGENT_BLOCK) → SYSTEM.md (global) / AGENTS.md (repo)
- mcp:    mergeMcpJson 'mcpServers' → ~/.pi/agent/mcp.json (global) / .mcp.json (repo)

Reused every existing helper (copyTree/writeBlock/mergeMcpJson/cleanLegacy,
AGENT_BLOCK, MCP_SERVER) — zero template changes.

TDD: wrote 3 RED tests in tests/install.test.mjs first
(registered-in-list, local install artifacts+mcp shape+instruction block,
idempotent rerun). Confirmed red with "unknown agent(s): pi", then added
the target → green. Full suite 90/90 (was 87).

`node dist/cli.js install pi --global --dry-run` resolves to the four
expected ~/.pi/agent paths.

Next: manual verify (real install + pi restart, confirm dolly_* MCP tools +
skill visible), then move 0003 to validating. Hook extension = follow-up task.
<!-- /dolly:step 0001 -->

<!-- dolly:step 0002 -->
## 0002 · 2026-08-07T20:04:49Z · @rjshrjndrn

- task status: validating
- files: `.gemini/settings.json`, `.pi/git-root.cache`, `.pi/memory.db`, `.pi/memory.db-shm`, `.pi/memory.db-wal`, `.windsurf/rules/dolly.md`, `AGENTS.md`, `GEMINI.md`, `opencode.json`, `package-lock.json`, `src/install.ts`, `tests/install.test.mjs`

## Fix: pi skill discovery path differs by scope

Symptom: after install, no dolly skill appeared in pi even though
files existed under <repo>/.pi/agent/skills.

Root cause (confirmed against pi.dev/docs/latest/skills "Locations"):
pi scans skills from
  - GLOBAL:  ~/.pi/agent/skills/  (and ~/.agents/skills/)
  - PROJECT: <repo>/.pi/skills/   (NOT <repo>/.pi/agent/skills — no
             agent/ segment) and <repo>/.agents/skills/
My first cut used base=~/.pi/agent for global and <repo>/.pi/agent for
local, then base/skills for both. Global resolved right by luck; local
wrote to .pi/agent/skills, a path pi never scans → skill invisible.

Fix: branch the skills dir on scope —
  global → ~/.pi/agent/skills
  local  → <repo>/.pi/skills
Instructions and MCP unchanged (SYSTEM.md/mcp.json global, AGENTS.md/
.mcp.json local). Dropped cleanLegacy (pi never had a dollie install).
detect local signal broadened to isDir(<repo>/.pi).

Tests: updated the local test to assert .pi/skills (and to assert
.pi/agent/skills is NEVER written locally); added a --global --dry-run
test asserting the ~/.pi/agent/skills path resolves. Suite 91/91.

Ran the real `dolly install pi --global`: skills, SYSTEM.md block, and
mcp.json dolly server all land. Removed the stale <repo>/.pi/agent/skills
left by the earlier buggy local install.

Human still needs to restart pi to confirm the dolly skill loads.
<!-- /dolly:step 0002 -->
