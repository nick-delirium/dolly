---
id: h2snm7k7
slug: current-targets-the-wrong-task-agents-can-set-do
title: current targets the wrong task; agents can set done
status: done
owner: nick-delirium
collaborators: [nick-delirium]
tags: [correctness]
steps: 1
spec_version: 1
created: 2026-11-20T08:51:35Z
updated: 2026-11-20T10:00:12Z
sessions: [36d7b4d9-0ca0-4cb9-8bd0-8b3723565119]
---

# h2snm7k7 · current targets the wrong task; agents can set done

<!-- dolly:header -->
`done` · spec v1 · @nick-delirium · 1 step · updated 2026-11-20 10:00Z
<!-- /dolly:header -->

## Spec

sessionTask counts todo tasks, so any dolly new in a session steals current — dolly step current lands on the wrong task. status <ref> done works from inside an agent although review refuses there. Fix both.

## Success Criteria

- [ ] _TBD_

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-11-20 08:56Z` @nick-delirium: status todo → working.
- `2026-11-20 08:59Z` @nick-delirium: current only considers this conversation's active tasks (working first), so dolly new mid-work no longer steals step current; done is refused at every CLI/MCP entry point unless a person at a terminal runs it.
  files: `src/core/store.ts`, `src/cli.ts`, `src/mcp.ts`, `tests/autolog-target.test.mjs`, `tests/mcp.test.mjs` · full: `steps.md#0001`
- `2026-11-20 08:59Z` @nick-delirium: status working → validating. Inside Claude Code, dolly new a todo task mid-work, then dolly step current: it lands on the working task. dolly status <ref> done refuses inside an agent; works in your terminal.
- `2026-11-20 10:00Z` @nick-delirium: status validating → done. Reviewed: built and tested this session (362 tests green).

