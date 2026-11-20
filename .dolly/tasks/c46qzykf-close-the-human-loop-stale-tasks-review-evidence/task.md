---
id: c46qzykf
slug: close-the-human-loop-stale-tasks-review-evidence
title: "Close the human loop: stale tasks, review evidence, backlog age"
status: done
owner: nick-delirium
collaborators: [nick-delirium]
tags: [loop]
steps: 1
spec_version: 1
created: 2026-11-20T08:56:35Z
updated: 2026-11-20T10:00:12Z
sessions: [36d7b4d9-0ca0-4cb9-8bd0-8b3723565119]
---

# c46qzykf · Close the human loop: stale tasks, review evidence, backlog age

<!-- dolly:header -->
`done` · spec v1 · @nick-delirium · 1 step · updated 2026-11-20 10:00Z
<!-- /dolly:header -->

## Spec

15 tasks sit in validating (oldest ~3mo) and two working tasks are 3mo stale, yet session start, statusline and current still offer them. Mark working tasks idle >14d as stale and stop offering them unless this conversation is attached; the board shows backlog age; review shows the commits naming the task and whether they are on the default branch, so closing is one key. No auto-done: a human still closes.

## Success Criteria

- [ ] session start, statusline and current never offer a stale task this conversation is not attached to
- [ ] board flags stale working tasks and shows the oldest validating age
- [ ] review shows commits naming the task, marked when on the default branch
- [ ] staleDays configurable (default 14)

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-11-20 08:59Z` @nick-delirium: status todo → working.
- `2026-11-20 09:02Z` @nick-delirium: Idle tasks (>14d, staleDays) are no longer offered as current, at session start or in the statusline; the board shows idle markers and backlog age; review shows the commits naming the task and whether they landed on the default branch.
  files: `src/core/store.ts`, `src/core/types.ts`, `src/core/render.ts`, `src/core/git.ts`, `src/review.ts`, `src/cli.ts` +3 more · full: `steps.md#0001`
- `2026-11-20 09:02Z` @nick-delirium: status working → validating. dolly board shows 'idle 3mo' on 6qp6wxbq/jd8s6t23 and the backlog age; a new session no longer offers them; dolly review shows Commits with 'on origin/main' for tasks like xj6mxdp6.
- `2026-11-20 10:00Z` @nick-delirium: status validating → done. Reviewed: built and tested this session (362 tests green).

