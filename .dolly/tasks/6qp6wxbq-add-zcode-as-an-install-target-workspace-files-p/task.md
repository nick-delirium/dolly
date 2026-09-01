---
id: 6qp6wxbq
slug: add-zcode-as-an-install-target-workspace-files-p
title: "Add zcode as an install target: workspace files + plugin-carried hooks"
status: working
owner: nick.delirium
collaborators: [nick.delirium, nick-delirium]
tags: []
steps: 2
spec_version: 2
created: 2026-08-30T19:42:35Z
updated: 2026-09-01T07:30:06Z
sessions: [1db55685-411f-4cb5-8ecf-6c263f7aeb07]
---

# 6qp6wxbq · Add zcode as an install target: workspace files + plugin-carried hooks

<!-- dolly:header -->
`working` · spec v2 · @nick.delirium · 2 steps · updated 2026-09-01 07:30Z
<!-- /dolly:header -->

## Spec

After `dolly install zcode`, a zcode session in that repo is fully dolly-native: repo-shared .zcode/skills + .zcode/commands + mcp.servers entry, plus a minimal plugin (SessionStart context injection incl. re-fire on compact, Stop auto-log) scaffolded under ~/.zcode/marketplaces/dolly/ with printed one-step marketplace instructions. Teammates cloning the repo get skills/commands/MCP free; each user installs the plugin once.

Full spec: `context/spec.md` · plan: `context/plan.md`

## Success Criteria

- [ ] fresh repo: dolly install zcode writes .zcode/skills/dolly/SKILL.md + dolly-planning/, .zcode/commands/dolly-*.md free of !` and ${:- forms, merges .zcode/config.json adding mcp.servers.dolly {command: "dolly", args: ["mcp"], enabled: true} without touching existing keys, writes AGENTS.md block
- [ ] plugin scaffold at ~/.zcode/marketplaces/dolly/ validates: plugin.json name matches ^[a-z0-9][a-z0-9._-]{0,127}$, hooks/hooks.json uses the plugin outer-hooks wrapper, hooks are process-type
- [ ] dolly hook stop --from-stdin fed zcode-shaped payloads (session_id, response-preview field names) never errors; logs a step when fields present
- [ ] session-start hook output is the hookSpecificOutput.additionalContext JSON both Claude Code and zcode accept
- [ ] idempotent rerun changes nothing; detect() fires when .zcode/ or ~/.zcode exists
- [ ] full suite + tsc clean

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-08-31 16:45Z` @nick.delirium: spec → v2. planning finished — spec derived from plan.md
  previous version kept in `spec.md`

### plan finalized · 2026-08-31 16:45Z · @nick.delirium

Plan complete. Status → todo.

- plan: `context/plan.md`
- `2026-08-31 16:46Z` @nick.delirium: status todo → working.
- `2026-09-01 07:21Z` @nick-delirium: Review done. Two commits, ~5.3k insertions. `tsc` clean. **`npm test` is red on main** — details below. `sandbox()` pins `DOLLY_DIR` but never chdirs, so `store.project` is the **dolly repo root**. Test 1 (line 46) dele…
  full: `steps.md#0001`
- `2026-09-01 07:30Z` @nick-delirium: All seven fixed. `tsc` clean, **222/222 green**. Verified: Not changed: `npm --prefix root install` does build via `"prepare"`, so `planUpdate`'s comment stands. EOF cancels + numbered path still works (`picker.test.mjs…
  files: `src/prompt.ts`, `src/cli.ts`, `src/core/memo.ts`, `src/core/update.ts`, `src/core/store.ts`, `tests/memo.test.mjs` +2 more · full: `steps.md#0002`

