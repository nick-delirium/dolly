---
id: h328m7vm
slug: reject-statuses-not-in-config-statuses
title: Reject statuses not in config.statuses
status: validating
owner: nick.delirium
collaborators: [nick.delirium]
tags: []
steps: 1
spec_version: 1
created: 2026-11-25T22:36:20Z
updated: 2026-11-25T22:39:49Z
sessions: [660193b5-d32e-4da1-bf13-3f78d143f73c]
---

# h328m7vm · Reject statuses not in config.statuses

<!-- dolly:header -->
`validating` · spec v1 · @nick.delirium · 1 step · updated 2026-11-25 22:39Z
<!-- /dolly:header -->

## Spec

dolly new --status / dolly status accepted any string (e.g. in-progress): the task showed on the board but was invisible to session-start and auto-log, which only know configured statuses. Reject unknown statuses with the valid list.

## Success Criteria

- [ ] new/status with an unknown status fail with the configured list and write nothing
- [ ] configured statuses still work

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-11-25 22:36Z` @nick.delirium: status todo → working.
- `2026-11-25 22:39Z` @nick.delirium: Unknown statuses are refused on every write path: assertStatus helper now guards createTask (dolly new, MCP, reindex) and plan finalize, before anything is written; 3 new tests, suite 368/368
  files: `src/core/task.ts`, `src/core/plan.ts`, `src/cli.ts`, `tests/task.test.mjs`, `tests/plan.test.mjs`, `tests/cli-args.test.mjs` · full: `steps.md#0001-nick.delirium`
- `2026-11-25 22:39Z` @nick.delirium: status working → validating. Check: dolly new x --status in-progress fails with the allowed list and creates nothing; --status working still works.

