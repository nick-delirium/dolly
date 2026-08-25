---
id: xb925jmt
slug: daily-memo-command
title: Daily memo command
status: validating
owner: nick.delirium
collaborators: [nick.delirium]
tags: []
steps: 2
spec_version: 2
created: 2026-08-25T15:14:54Z
updated: 2026-08-25T17:08:27Z
---

# xb925jmt · Daily memo command

<!-- dolly:header -->
`validating` · spec v2 · @nick.delirium · 2 steps · updated 2026-08-25 17:08Z
<!-- /dolly:header -->

## Spec

gathers everything that happened today — steps, status moves, spec changes across all tasks, plus chat turns from Claude Code and opencode transcripts and raw git activity — and prints a digest. The agent turns it into a short prose memo (what was worked on, files changed, related-task links) saved as .dolly/memo/YYYY-MM-DD.md, committed with the repo.

Full spec: `context/spec.md` · plan: `context/plan.md`

## Success Criteria

- [ ] dolly memo prints a digest covering tasks + transcripts + git for today
- [ ] --date works for backfill; days with nothing report cleanly
- [ ] memo --file saves .dolly/memo/2026-08-25.md and it shows in board-era commands (?) and is git-committable
- [ ] /dolly-memo works in opencode and claude
- [ ] memo.auto=true surfaces a session-start hint when today has no memo
- [ ] npm test green

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-08-25 15:28Z` @nick.delirium: spec → v2. planning finished — spec derived from plan.md
  previous version kept in `spec.md`

### plan finalized · 2026-08-25 15:28Z · @nick.delirium

Plan complete. Status → todo.

- plan: `context/plan.md`
- `2026-08-25 16:49Z` @nick.delirium: status todo → working.
- `2026-08-25 17:07Z` @nick.delirium: The `dolly memo` digest already runs. Let me see the full output before writing the memo.
  full: `steps.md#0001`
- `2026-08-25 17:08Z` @nick.delirium: dolly memo ships: one command aggregates today's task events, chat sessions (claude + opencode mirrors) and commits into a digest; prose gets saved to .dolly/memo/YYYY-MM-DD.md with --save. memo.auto adds a session-start nudge. /dolly-memo works in opencode and claude — verified live, first memo of the day is committed below.
  files: `.claude/commands/dolly/board.md`, `.claude/commands/dolly/housekeep.md`, `.claude/commands/dolly/memo.md`, `.claude/skills/dolly/SKILL.md`, `.opencode/commands/dolly-adopt.md`, `.opencode/commands/dolly-board.md` +50 more · full: `steps.md#0002`
- `2026-08-25 17:08Z` @nick.delirium: status working → validating. human: skim .dolly/memo/2026-08-25.md (written by opencode) and try dolly memo yourself

