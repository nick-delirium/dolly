---
id: n58fpdzt
slug: fewer-commands-delete-dead-ones-merge-the-weak-o
title: "Fewer commands: delete dead ones, merge the weak ones"
status: done
owner: nick-delirium
collaborators: [nick-delirium]
tags: []
steps: 1
spec_version: 2
created: 2026-11-20T08:51:36Z
updated: 2026-11-20T10:00:12Z
sessions: [36d7b4d9-0ca0-4cb9-8bd0-8b3723565119]
---

# n58fpdzt · Fewer commands: delete dead ones, merge the weak ones

<!-- dolly:header -->
`done` · spec v2 · @nick-delirium · 1 step · updated 2026-11-20 10:00Z
<!-- /dolly:header -->

## Spec

Every command that remains earns its place, and the help, skill and MCP surface shrink to match. Removed names fail with a one-line pointer at the replacement for one version, so muscle memory and old skill text degrade gracefully instead of silently.

Out of scope: renaming surviving commands; removing aliases that cost nothing (`ls`, `add`, …); changing store layout (none needed).

Full spec: `context/spec.md` · plan: `context/plan.md`

## Success Criteria

- [ ] `dolly help` lists ≤ 26 top-level commands
- [ ] each removed name exits 1 with "`X` was removed — use `Y`"
- [ ] `dolly why a.ts b.ts` lists related tasks (with their latest outcome), commits and prose; `dolly related` points at why
- [ ] `dolly init` on an initialized store opens the setup screen (TTY) or applies the flags (no TTY), as setup did
- [ ] `dolly spec <ref> --title "x"` renames the task and its directory
- [ ] `dolly show <ref>` prints exactly what `dolly context <ref>` prints
- [ ] `dolly config --defaults` prints the default config; `dolly --version` prints the version
- [ ] MCP tool list stays < 8KB; footprint tests green; npm test green
- [ ] no skill, command or README text names a removed command (a test greps for it)

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-11-20 08:56Z` @nick-delirium: spec → v2. planning finished — spec derived from plan.md
  previous version kept in `spec.md`

### plan finalized · 2026-11-20 08:56Z · @nick-delirium

Plan complete. Status → todo.

- plan: `context/plan.md`
- `2026-11-20 09:12Z` @nick-delirium: status todo → working.
- `2026-11-20 09:19Z` @nick-delirium: 39 command names → 26 commands (+ hidden aliases): current/setup/retitle/related/defaults/version/memo/digest/plan show removed with pointers; show is an alias of context; why takes several files and ranks tasks; spec --title renames; MCP related→why, task_show folded into context; digest code deleted.
  files: `src/cli.ts`, `src/mcp.ts`, `src/core/render.ts`, `src/core/compact.ts`, `src/core/related.ts`, `src/core/task.ts` +17 more · full: `steps.md#0001`
- `2026-11-20 09:19Z` @nick-delirium: status working → validating. dolly help reads well top to bottom (26 commands); each removed name prints its replacement; dolly why src/core/task.ts src/core/render.ts ranks; re-run dolly install claude to refresh the shipped skill/commands.
- `2026-11-20 10:00Z` @nick-delirium: status validating → done. Reviewed: built and tested this session (362 tests green).

