---
id: t26kjrsz
slug: agent-footprint-hot-path-latency-audit
title: Agent footprint + hot-path latency audit
status: validating
owner: nick-delirium
collaborators: [nick-delirium]
tags: [footprint]
steps: 1
spec_version: 1
created: 2026-10-20T11:40:31Z
updated: 2026-10-20T11:49:01Z
sessions: [30490afd-79ca-44be-91bb-1f8b86dff17b]
---

# t26kjrsz · Agent footprint + hot-path latency audit

<!-- dolly:header -->
`validating` · spec v1 · @nick-delirium · 1 step · updated 2026-10-20 11:49Z
<!-- /dolly:header -->

## Spec

Measure everything dolly puts into an agent's context (instruction block, MCP tool list + server instructions, skill/command descriptions, session-start, context payload) and the latency of what runs every session/turn (session-start, hook stop, context). Take the easy wins; recommend the config-level ones.

## Success Criteria

- [ ] _TBD_

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-10-20 11:40Z` @nick-delirium: status todo → working.
- `2026-10-20 11:49Z` @nick-delirium: MCP tool list 8987→7444 B (one dolly_plan tool, ref described once, enum checks), skill 8.2→7.2KB, context drops the short spec when the full spec already contains it and the empty brief footer; hot paths measured (hook stop 90ms on a 4.4MB transcript) — no latency work needed.
  files: `src/mcp.ts`, `src/core/render.ts`, `skills/dolly/SKILL.md`, `README.md`, `tests/mcp.test.mjs`, `tests/footprint.test.mjs` +3 more · full: `steps.md#0001`
- `2026-10-20 11:49Z` @nick-delirium: status working → validating. npm test (323). MCP: dolly_plan replaces dolly_plan_start/set/qa/check/finalize — check any saved prompts. Decide: install.mcp in this repo, and the block living in both ~/.claude/CLAUDE.md and project CLAUDE.md.

