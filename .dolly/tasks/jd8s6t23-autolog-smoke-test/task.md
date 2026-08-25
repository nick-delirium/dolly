---
id: jd8s6t23
slug: autolog-smoke-test
title: autolog smoke test
status: working
owner: rjshrjndrn
collaborators: [rjshrjndrn, nick.delirium]
tags: []
steps: 3
spec_version: 1
created: 2026-08-08T03:13:29Z
updated: 2026-08-25T17:42:29Z
---

# jd8s6t23 · autolog smoke test

<!-- dolly:header -->
`working` · spec v1 · @rjshrjndrn · 3 steps · updated 2026-08-25 17:42Z
<!-- /dolly:header -->

## Spec

throwaway: prove pi turn_end auto-logs a step end-to-end

## Success Criteria

- [ ] _TBD_

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-08-08 03:13Z` @rjshrjndrn: status todo → working.
- `2026-08-08 03:13Z` @rjshrjndrn: Ran bash.
  full: `steps.md#0001`
- `2026-08-08 03:13Z` @rjshrjndrn: It printed `dolly-autolog-probe`.
  full: `steps.md#0002`
- `2026-08-08 03:13Z` @rjshrjndrn: archived.
- `2026-08-25 17:42Z` @nick.delirium: Cross-feature review found and fixed six issues before they shipped: agent docs re-teaching dead numeric-id formats, memo reading the wrong file for file-trailers (+ regex never matching trailers), v5 migration rmrf-ing archive copies it had promised to preserve on collision, picker prefilter able to empty its own list, auto-log dropping opencode/pi session links, README tool/agent counts.
  files: `.claude/commands/dolly/board.md`, `.claude/commands/dolly/checkpoint.md`, `.claude/commands/dolly/memo.md`, `.claude/skills/dolly/SKILL.md`, `.opencode/commands/dolly-adopt.md`, `.opencode/commands/dolly-board.md` +54 more · full: `steps.md#0003`

