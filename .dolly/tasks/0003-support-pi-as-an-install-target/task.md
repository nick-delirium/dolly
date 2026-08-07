---
id: "0003"
slug: support-pi-as-an-install-target
title: support pi as an install target
status: validating
owner: rjshrjndrn
collaborators: [rjshrjndrn]
tags: []
steps: 2
spec_version: 2
created: 2026-08-07T19:27:58Z
updated: 2026-08-07T20:04:49Z
---

# 0003 · support pi as an install target

<!-- dolly:header -->
`validating` · spec v2 · @rjshrjndrn · 2 steps · updated 2026-08-07 20:04Z
<!-- /dolly:header -->

## Spec

`dolly install` detects a pi installation and wires dolly into it the same way it does Claude Code (minus hooks): copies the dolly + dolly-planning skills, writes the AGENT_BLOCK instructions, and registers the MCP server in pi's config. Running dolly under pi then gets the skill and the dolly_* MCP tools with zero manual setup.

Full spec: `context/spec.md` · plan: `context/plan.md`

## Success Criteria

- [ ] `dolly install` lists 'pi' as a detected target when ~/.pi/agent exists.
- [ ] Installing writes skills/dolly and skills/dolly-planning under the pi base.
- [ ] Installing writes the AGENT_BLOCK instruction block into the pi instruction file.
- [ ] With --mcp, a 'dolly' entry is merged under mcpServers in pi's mcp config.
- [ ] Re-running install is idempotent (reports up-to-date, no dupes).
- [ ] Unit tests cover detect true/false and install artifacts, all green via `make test`.

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-08-07 19:36Z` @rjshrjndrn: spec → v2. planning finished — spec derived from plan.md
  previous version kept in `spec.md`

### plan finalized · 2026-08-07 19:36Z · @rjshrjndrn

Plan complete. Status → todo.

- plan: `context/plan.md`
- `2026-08-07 19:40Z` @rjshrjndrn: status todo → working.
- `2026-08-07 19:45Z` @rjshrjndrn: pi install target lands as a TARGETS[] entry mirroring claude minus commands/hooks; reuses all helpers, no template changes. 3 RED tests first, suite 90/90.
  files: `.gemini/settings.json`, `.pi/git-root.cache`, `.pi/memory.db`, `.pi/memory.db-shm`, `.pi/memory.db-wal`, `.windsurf/rules/dolly.md` +6 more · full: `steps.md#0001`
- `2026-08-07 19:47Z` @rjshrjndrn: status working → validating. run `dolly install pi --global` (drops the --dry-run), restart pi, confirm the dolly_* MCP tools + dolly/dolly-planning skills are visible. Also decide: keep repo-scoped .pi/agent skills or force --global for pi.
- `2026-08-07 20:04Z` @rjshrjndrn: pi skill path is scope-dependent: pi scans ~/.pi/agent/skills (global) but <repo>/.pi/skills (local, no agent/ segment). First cut wrote local skills to the unscanned .pi/agent/skills. Branch by scope; verified against pi docs. Suite 91/91.
  files: `.gemini/settings.json`, `.pi/git-root.cache`, `.pi/memory.db`, `.pi/memory.db-shm`, `.pi/memory.db-wal`, `.windsurf/rules/dolly.md` +6 more · full: `steps.md#0002`

