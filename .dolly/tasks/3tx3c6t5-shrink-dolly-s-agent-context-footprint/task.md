---
id: 3tx3c6t5
slug: shrink-dolly-s-agent-context-footprint
title: "Shrink dolly's agent context footprint"
status: validating
owner: nick-delirium
collaborators: [nick-delirium]
tags: [context]
steps: 2
spec_version: 1
created: 2026-09-29T13:59:33Z
updated: 2026-09-29T14:45:38Z
sessions: [9b8fa6e3-cae2-461d-83e8-303d1b261b96]
---

# 3tx3c6t5 · Shrink dolly's agent context footprint

<!-- dolly:header -->
`validating` · spec v1 · @nick-delirium · 2 steps · updated 2026-09-29 14:45Z
<!-- /dolly:header -->

## Spec

Cut what dolly injects into agent context: slim always-loaded instruction block (~20 lines) with full guide in skill + new 'dolly guide' command; session-start injection ~6KB→~2KB (no repeated boilerplate, brief cut at section boundaries, active task only when session-linked or fresh); dolly context drops finalized plan, dedups auto-step bodies, caps log/files; MCP off by default + trimmed descriptions; drop duplicate checkpoint command.

## Success Criteria

- [ ] AGENT_BLOCK <= ~2KB; dolly guide prints the full guide
- [ ] session-start output for this repo <= ~2.5KB
- [ ] dolly context for 6qp6wxbq and v94p7gqv at least 40% smaller with no information only available there lost
- [ ] install.mcp defaults false; tool descriptions trimmed
- [ ] checkpoint command removed and pruned on reinstall
- [ ] suite + tsc clean; README/skills updated

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-09-29 14:35Z` @nick-delirium: status todo → working.
- `2026-09-29 14:40Z` @nick-delirium: Session-start 5.1KB→1.9KB (one task, no criteria/boilerplate); dolly context −40..57% on planned/auto-logged tasks: finalized plan and spec's criteria copy dropped, log capped, auto-steps keep what the agent said not its tool trace. Fixed a lock race the parallel test exposed (lock now linked atomically).
  files: `src/cli.ts`, `src/core/render.ts`, `src/core/project.ts`, `src/reindex.ts`, `src/core/lock.ts`, `tests/hooks.test.mjs` +4 more · full: `steps.md#0001`
- `2026-09-29 14:45Z` @nick-delirium: Always-loaded block 6.2KB→1.5KB with the full guide behind 'dolly guide'; skill 10.6→6.1KB and both skill descriptions halved; MCP opt-in with a 22% smaller tool list; checkpoint command dropped. Budgets asserted in tests so they cannot creep back.
  files: `src/templates/instructions.ts`, `src/cli.ts`, `src/mcp.ts`, `src/core/types.ts`, `skills/dolly/SKILL.md`, `skills/dolly-planning/SKILL.md` +9 more · full: `steps.md#0002`
- `2026-09-29 14:45Z` @nick-delirium: status working → validating. Start a fresh Claude session here: CLAUDE.md block + session-start should total ~3.5KB; run dolly context on a planned task (no Plan section, criteria once); dolly guide prints the skill. npm test 284.

