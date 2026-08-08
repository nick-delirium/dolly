---
id: "0004"
slug: pi-hook-extension-for-auto-inject-and-auto-log
title: pi hook extension for auto-inject and auto-log
status: done
owner: rjshrjndrn
collaborators: [rjshrjndrn]
tags: []
steps: 7
spec_version: 3
created: 2026-08-07T20:19:39Z
updated: 2026-08-08T03:20:41Z
---

# 0004 · pi hook extension for auto-inject and auto-log

<!-- dolly:header -->
`done` · spec v3 · @rjshrjndrn · 7 steps · updated 2026-08-08 03:20Z
<!-- /dolly:header -->

## Spec

pi extension gives pi BOTH halves of Claude's ambient behavior. Auto-inject (before_agent_start → dolly hook session-start --raw, shipped). Auto-log (turn_end → NEW dolly hook stop --from-stdin, reads the turn from pi's in-memory event and bypasses the Claude-only transcript parser entirely). Global-only, failure always swallowed.

## Success Criteria

- [ ] `dolly install pi --global` writes ~/.pi/agent/extensions/dolly.ts.
- [ ] The extension registers a before_agent_start handler that shells `dolly hook session-start` and appends stdout to systemPrompt.
- [ ] Extension has no hard dependency on a specific pi package name (untyped or inline type).
- [ ] Failure of the dolly command (absent binary, no store) is swallowed — the turn is never blocked and systemPrompt is returned unchanged.
- [ ] Re-running install is idempotent (up-to-date, no duplicate/overwrite churn).
- [ ] Manual: restart pi in this repo, confirm the injected dolly context block appears at session start.
- [ ] Unit tests green via `make test`.

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-08-07 20:27Z` @rjshrjndrn: spec → v2. planning finished — spec derived from plan.md
  previous version kept in `spec.md`

### plan finalized · 2026-08-07 20:27Z · @rjshrjndrn

Plan complete. Status → todo.

- plan: `context/plan.md`
- `2026-08-07 20:28Z` @rjshrjndrn: status todo → working.
- `2026-08-07 20:32Z` @rjshrjndrn: pi auto-inject extension lands: install writes ~/.pi/agent/extensions/dolly.ts, shells 'dolly hook session-start --raw' into systemPrompt on before_agent_start. Added --raw mode because the hook emits Claude's JSON envelope, not plain text — caught by running it. Untyped extension dodges the pi package-name split. 94/94.
  files: `.gemini/settings.json`, `.pi/git-root.cache`, `.pi/memory.db`, `.pi/memory.db-shm`, `.pi/memory.db-wal`, `.pi/skills/dolly-planning/SKILL.md` +10 more · full: `steps.md#0001`
- `2026-08-07 20:32Z` @rjshrjndrn: status working → validating. restart pi in this repo, confirm the dolly context block is injected at session start (should see 'dolly store: ...' + active task). Then rename/remove the dolly bin and start pi — confirm it still boots clean (failure is swallowed, prompt unchanged).
- `2026-08-07 20:35Z` @rjshrjndrn: Validated both criteria with data: fresh 'pi -p' session received the injected dolly-store context (auto-inject works); with dolly off PATH pi still booted and answered (failure swallowed). Confirmed pi auto-loads ~/.pi/agent/extensions/*.ts via the acm.ts precedent.
  files: `src/install.ts` · full: `steps.md#0002`
- `2026-08-07 20:37Z` @rjshrjndrn: status validating → done. Human confirmed auto-inject context visible at pi session start
- `2026-08-07 20:48Z` @rjshrjndrn: Correction logged: pi auto-log is NOT a DOLLY_TRANSCRIPT_DIR tweak. transcript.ts overrides only the dir; escapeCwd + the line parser are both hardwired to Claude's schema, so pi lines parse to zero turns. Two mismatches (location + schema); env fixes at most one. v2 should take event-driven path (b): turn_end + a new 'dolly hook stop --from-stdin', bypassing transcript.ts entirely.
  files: `src/core/transcript.ts` · full: `steps.md#0003`
- `2026-08-08 03:05Z` @rjshrjndrn: status done → working.
- `2026-08-08 03:09Z` @rjshrjndrn: spec → v3. User pulled auto-log forward into this task instead of a separate v2. Event-driven path (b) chosen: pi's turn_end carries the turn, so a stdin entrypoint sidesteps transcript.ts (which is Claude-only in location AND schema).
  previous version kept in `spec.md`
- `2026-08-08 03:11Z` @rjshrjndrn: Smoke-test: event-driven auto-log wired end to end.
  files: `src/cli.ts`, `src/install.ts` · full: `steps.md#0004`
- `2026-08-08 03:12Z` @rjshrjndrn: Auto-log v2 lands via event-driven path: new 'dolly hook stop --from-stdin' builds a step from a turn piped on stdin (dedup by session:turn, skip-if-agent-logged, config-gated, garbage-safe); extension gains turn_start/turn_end that reads pi's in-memory event and pipes it. Bypasses transcript.ts entirely. 99/99. NB: the 'Smoke-test...' line above is a test artifact, ignore it.
  files: `.gemini/settings.json`, `.pi/git-root.cache`, `.pi/memory.db`, `.pi/memory.db-shm`, `.pi/memory.db-wal`, `.windsurf/rules/dolly.md` +8 more · full: `steps.md#0005`
- `2026-08-08 03:12Z` @rjshrjndrn: status working → validating. restart pi (extension already installed), keep task 0004 (or any) 'working', do one real turn that edits a file, then check: the turn is auto-logged as a step on the active task (dolly context <ref> --brief). Also confirm: a turn where you manually ran 'dolly step' is NOT double-logged. And the 'Smoke-test... turn live-demo:99' step on 0004 is a test artifact from implementation — ignore/expect it.
- `2026-08-08 03:14Z` @rjshrjndrn: Auto-log confirmed with a live 'pi -p' run: a throwaway working task got two real steps from the nested session's turns (tool-call turn -> 'Ran bash.', text turn -> the answer), each stamped with the real pi session id and turn dedup key. Full turn_end -> stdin -> addStep chain proven, not mocked. Throwaway archived.
  files: `src/install.ts`, `src/cli.ts` · full: `steps.md#0006`
- `2026-08-08 03:17Z` @rjshrjndrn: status validating → done.
- `2026-08-08 03:20Z` @rjshrjndrn: status done → working.
- `2026-08-08 03:20Z` @rjshrjndrn: README documents pi: intro lists it alongside Claude, agents table gains a pi row (skills, SYSTEM.md/AGENTS.md, mcp.json, extensions/dolly.ts), and the Automatic-logging section notes pi's event-driven route (turn_end -> stop --from-stdin, no transcript) vs Claude's Stop-hook transcript parse.
  files: `README.md`
- `2026-08-08 03:20Z` @rjshrjndrn: status working → done.

