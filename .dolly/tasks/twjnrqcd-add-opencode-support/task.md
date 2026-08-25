---
id: twjnrqcd
slug: add-opencode-support
title: Add opencode support
status: done
owner: nick.delirium
collaborators: [nick.delirium]
tags: []
steps: 4
spec_version: 2
created: 2026-08-25T14:35:24Z
updated: 2026-08-25T15:14:12Z
---

# twjnrqcd · Add opencode support

<!-- dolly:header -->
`done` · spec v2 · @nick.delirium · 4 steps · updated 2026-08-25 15:14Z
<!-- /dolly:header -->

## Spec

An opencode session in a dolly-initialized repo behaves like a Claude Code session: task context appears at session start (and survives compaction), skills and /dolly:* commands work, every finished turn auto-logs a step, and dolly reindex can adopt an opencode conversation.

Full spec: `context/spec.md` · plan: `context/plan.md`

## Success Criteria

- [ ] dolly install opencode writes skills, commands, plugin, AGENTS.md block, MCP entry and instructions wiring — idempotently (--dry-run previewable)
- [ ] an opencode session in this repo shows dolly task context without any agent action
- [ ] /dolly-board and at least one other /dolly:* command run inside opencode TUI
- [ ] a finished turn in opencode produces a step in the current task's log automatically
- [ ] dolly reindex lists/imports an opencode session for this repo
- [ ] npm test passes including new install/plugin tests

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-08-25 14:36Z` @nick.delirium: spec → v2. planning finished — spec derived from plan.md
  previous version kept in `spec.md`

### plan finalized · 2026-08-25 14:36Z · @nick.delirium

Plan complete. Status → todo.

- plan: `context/plan.md`
- `2026-08-25 14:36Z` @nick.delirium: status todo → working.
- `2026-08-25 14:51Z` @nick.delirium: 0001 (validating), 0002 (planning), 0007 (working)
  full: `steps.md#0001`
- `2026-08-25 14:54Z` @nick.delirium: ```
  full: `steps.md#0002`
- `2026-08-25 14:55Z` @nick.delirium: opencode reaches Claude Code parity: skills+slash commands+MCP via installer, generated plugin injects task context every LLM call (system.transform) and across compaction, auto-logs each finished turn, mirrors turns to JSONL so dolly reindex adopts opencode sessions (opencode stores real sessions in SQLite — plugin-side mirror is the bridge). Verified live: headless opencode session ran dolly, mirror+auto-log landed on 0007, reindex lists the session.
  files: `.opencode/commands/dolly-adopt.md`, `.opencode/commands/dolly-board.md`, `.opencode/commands/dolly-housekeep.md`, `.opencode/commands/dolly-plan.md`, `.opencode/commands/dolly-resume.md`, `.opencode/commands/dolly-spec.md` +15 more · full: `steps.md#0003`
- `2026-08-25 14:55Z` @nick.delirium: status working → validating. human: open interactive opencode TUI in this repo and confirm context banner appears, /dolly-board runs, and steps auto-log; also review generated .opencode/plugins/dolly.js
- `2026-08-25 15:05Z` @nick.delirium: status validating → working.
- `2026-08-25 15:05Z` @nick.delirium: /dolly-board no longer triggers a model response: commands can declare frontmatter direct:true; the generated plugin intercepts them in command.execute.before, runs the template's !`cmd` via session.shell so output lands verbatim in the transcript, then cancels the LLM call (throw = skip). Only board is direct — audited the other eight commands, all legitimately need the agent.
  files: `.opencode/commands/dolly-adopt.md`, `.opencode/commands/dolly-board.md`, `.opencode/commands/dolly-housekeep.md`, `.opencode/commands/dolly-plan.md`, `.opencode/commands/dolly-resume.md`, `.opencode/commands/dolly-spec.md` +16 more · full: `steps.md#0004`
- `2026-08-25 15:05Z` @nick.delirium: status working → validating. human: run /dolly-board in the interactive opencode TUI — expect the board printed once, no model narration afterward
- `2026-08-25 15:14Z` @nick.delirium: status validating → done.

