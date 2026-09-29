---
id: rqdpztdy
slug: auto-log-targets-this-session-s-task-lock-store
title: "Auto-log targets this session's task; lock store writes"
status: validating
owner: nick-delirium
collaborators: [nick-delirium]
tags: [autolog]
steps: 1
spec_version: 1
created: 2026-09-29T13:59:33Z
updated: 2026-09-29T14:34:35Z
sessions: [9b8fa6e3-cae2-461d-83e8-303d1b261b96]
---

# rqdpztdy · Auto-log targets this session's task; lock store writes

<!-- dolly:header -->
`validating` · spec v1 · @nick-delirium · 1 step · updated 2026-09-29 14:34Z
<!-- /dolly:header -->

## Spec

Stop-hook auto-log and 'current' pick the most recently updated working task regardless of session/owner, so unrelated sessions pollute stale tasks (seen: 5nbx4mdy, jd8s6t23, 6qp6wxbq). Resolve the session's own task first; never auto-log onto a task this session is not linked to. Add an exclusive lock around task mutations so parallel steps/hooks cannot duplicate step ids. Stop plugin+project hooks double-firing.

## Success Criteria

- [ ] auto-log only writes to a task linked to the running session (or explicitly adopted); unrelated working task untouched
- [ ] current prefers session-linked task, then own tasks, then recency
- [ ] parallel dolly step x8 → 8 distinct steps, counter 8
- [ ] mergeHooks recognizes plugin hook command; install skips project hooks when plugin present
- [ ] suite + tsc clean

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-09-29 14:26Z` @nick-delirium: status todo → working.
- `2026-09-29 14:34Z` @nick-delirium: Auto-log now writes only to a task this conversation already wrote to (the stale-'current' pollution is gone); current prefers session, then own tasks. Every write holds a per-store lock (8 parallel steps → 8 distinct). Plugin hooks defer to settings hooks; pi logs per prompt, opencode survives restarts.
  files: `src/core/lock.ts`, `src/core/session.ts`, `src/core/store.ts`, `src/core/task.ts`, `src/cli.ts`, `src/mcp.ts` +7 more · full: `steps.md#0001`
- `2026-09-29 14:34Z` @nick-delirium: status working → validating. Run npm test (276). In a real session: open a new Claude session in a repo with an old working task, do a turn without any dolly write → nothing logged; run 'dolly status <ref> working' → next turn logs there.

