---
id: "0004"
slug: pi-hook-extension-for-auto-inject-and-auto-log
title: pi hook extension for auto-inject and auto-log
status: working
owner: rjshrjndrn
collaborators: [rjshrjndrn]
tags: []
steps: 1
spec_version: 2
created: 2026-08-07T20:19:39Z
updated: 2026-08-07T20:32:38Z
---

# 0004 · pi hook extension for auto-inject and auto-log

<!-- dolly:header -->
`working` · spec v2 · @rjshrjndrn · 1 step · updated 2026-08-07 20:32Z
<!-- /dolly:header -->

## Spec

Give pi the auto-INJECT half of Claude's ambient behavior: a pi extension that dolly install writes to ~/.pi/agent/extensions/dolly.ts, which on before_agent_start shells `dolly hook session-start` and prepends its output to the system prompt. Every pi session then opens already knowing the active task's spec, criteria, and recent steps — zero agent effort. Auto-log is explicitly deferred to a follow-up.

Full spec: `context/spec.md` · plan: `context/plan.md`

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

