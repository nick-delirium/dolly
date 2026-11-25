---
id: tc4bj56j
slug: opencode-attach-tasks-via-opencode-session-id-so
title: "opencode: attach tasks via OPENCODE_SESSION_ID so turns auto-log"
status: validating
owner: nick.delirium
collaborators: [nick.delirium]
tags: [opencode]
steps: 1
spec_version: 1
created: 2026-11-25T22:36:09Z
updated: 2026-11-25T22:36:16Z
sessions: [660193b5-d32e-4da1-bf13-3f78d143f73c]
---

# tc4bj56j · opencode: attach tasks via OPENCODE_SESSION_ID so turns auto-log

<!-- dolly:header -->
`validating` · spec v1 · @nick.delirium · 1 step · updated 2026-11-25 22:36Z
<!-- /dolly:header -->

## Spec

Read OPENCODE_SESSION_ID in currentSessionId so tasks picked up inside opencode attach to the session and the plugin's per-turn auto-log lands; dolly continue reopens ses_ sessions in opencode.

## Success Criteria

- [ ] a task picked up in opencode gets its turns auto-logged
- [ ] dolly continue prints opencode --session for ses_ ids and refuses --fork

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-11-25 22:36Z` @nick.delirium: status todo → working.
- `2026-11-25 22:36Z` @nick.delirium: opencode turns now auto-log: currentSessionId reads OPENCODE_SESSION_ID (before Claude's), dolly continue reopens ses_ sessions in opencode; 2 new tests, suite 365/365, verified in a live opencode run
  files: `src/core/session.ts`, `src/cli.ts`, `tests/autolog-target.test.mjs`, `tests/helpers.mjs` · full: `steps.md#0001-nick.delirium`
- `2026-11-25 22:36Z` @nick.delirium: status working → validating. Check: in opencode, pick up a task with dolly status <id> working, edit a file, see an auto-logged step; dolly continue <id> --print shows opencode --session.

