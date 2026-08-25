<!-- dolly plan · created 2026-08-25T14:35:24Z · @nick.delirium -->
# Plan — Add opencode support

> Interview record. Every section below must be answered before `dolly plan finalize`.
> Gate: `dolly plan check` fails while a section is empty, `_TBD_`, or an Open Question is unchecked.

## Brief

Reach feature parity with Claude Code for the opencode CLI using skills, commands, a plugin, config instructions and transcript reindex. Success criteria: dolly fully usable inside an opencode session.

## Problem

opencode users get only an AGENTS.md block + an MCP entry. No skills, no slash commands, no session-start context injection, no auto-logging, no reindex of opencode conversations. Claude Code gets all of these, so dolly's continuity guarantees silently degrade in opencode sessions.

## Goal

An opencode session in a dolly-initialized repo behaves like a Claude Code session: task context appears at session start (and survives compaction), skills and /dolly:* commands work, every finished turn auto-logs a step, and dolly reindex can adopt an opencode conversation.

## Scope

In:
- install.ts opencode target: skills → .opencode/skills/, commands → .opencode/commands/ (no rewrite needed; opencode supports !`cmd`), generated plugin → .opencode/plugins/dolly.js, instructions entry in opencode.json
- Generated opencode plugin: session-start context inject, compaction reinject (experimental.session.compacting), turn-end auto-log via dolly hook stop --from-stdin (modeled on PI_EXTENSION)
- Transcript reader for opencode storage so reindex works for opencode sessions
- README + install table updates, tests mirroring the pi ones

Out:
- npm-published plugin package (local plugin file is enough)
- statusline equivalent (opencode has none)
- Claude-plugin marketplace equivalent

## Success Criteria

- [ ] dolly install opencode writes skills, commands, plugin, AGENTS.md block, MCP entry and instructions wiring — idempotently (--dry-run previewable)
- [ ] an opencode session in this repo shows dolly task context without any agent action
- [ ] /dolly-board and at least one other /dolly:* command run inside opencode TUI
- [ ] a finished turn in opencode produces a step in the current task's log automatically
- [ ] dolly reindex lists/imports an opencode session for this repo
- [ ] npm test passes including new install/plugin tests

## Changes

Guesses marked (?).
- src/install.ts: rewrite opencode target install(); add OPENCODE_PLUGIN const (generated .js, untyped like PI_EXTENSION so no dep on @opencode-ai/plugin); reuse mergeMcpJson-style logic for opencode.json (mcp + instructions array)
- src/core/transcript.ts: opencode storage reader — ~/.local/share/opencode/storage/session/<dir>/<id>.json, message/, part/ JSON files; map to existing Segment model. Session selection env DOLLY_TRANSCRIPT_DIR stays the escape hatch
- src/reindex.ts: route by transcript kind (auto-detect claude vs opencode)
- README.md: agents table row, Automatic-logging section, reindex section
- tests/: extend install.test.mjs, new transcript-opencode.test.mjs with fixture storage tree

## Risks

- Plugin hook surface is partly experimental: experimental.session.compacting may change; wrap everything, fail soft like pi extension does
- Exact opencode storage layout on disk may differ per version/platform (?); mitigate with SDK client fallback in plugin and --file flag always available
- session-start injection relies on config 'instructions' file reference — verify field name/glob support against current docs during implementation
- Auto-log dedup depends on turn timing heuristics already in dolly hook stop; opencode turn ids may need mapping

## Test Plan

- Unit: install.test.mjs — opencode install writes all six artifacts, idempotent on re-run, --dry-run writes nothing
- Unit: transcript-opencode.test.mjs — fixture storage tree parses into Segments (prompts, files, work chain)
- Integration/manual: in this repo, run opencode TUI: context appears at start; /dolly-board runs; a turn auto-logs; reindex sees the session

## Open Questions

- [x] Success measure? → dolly fully usable inside an opencode session (user)
- [x] Plugin packaging? → local .opencode/plugins file, no npm package (user: implement everything, keep it simple)
- [x] Scope of 'everything'? → skills + commands + plugin + injection + auto-log + reindex (user approved plan matrix)

## Q&A

_none yet_
