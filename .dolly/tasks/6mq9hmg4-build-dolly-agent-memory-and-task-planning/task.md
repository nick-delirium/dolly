---
id: 6mq9hmg4
slug: build-dolly-agent-memory-and-task-planning
title: "Build dolly: agent memory and task planning"
status: validating
owner: nick-delirium
collaborators: [nick-delirium]
tags: []
steps: 15
spec_version: 2
created: 2026-08-07T08:50:48Z
updated: 2026-08-07T11:06:38Z
sessions: [faa33f88-d19e-451a-8321-307f7d37483e]
---

# 6mq9hmg4 · Build dolly: agent memory and task planning

<!-- dolly:header -->
`validating` · spec v2 · @nick-delirium · 15 steps · updated 2026-08-07 11:06Z
<!-- /dolly:header -->

## Spec

Task memory and planning for coding agents, as plain markdown in the repo. Board (todo→planning→working→validating→done), append-only step log with GitHub attribution, versioned specs, gated planning interview, configurable housekeeping. Installs into Claude Code plus 7 other agents. Zero runtime deps.

## Success Criteria

- [ ] task.md shows spec, criteria and a chronological one-line-per-event log with timestamp, handle, summary and changed files
- [ ] full step context and full spec history survive any context reset
- [ ] a spec change bumps a version and preserves the previous one with its reason
- [ ] planning cannot be finalized with unanswered questions
- [ ] housekeeping ages out finished work without destroying summaries by default
- [ ] one command wires Claude Code; other agents covered where cheap
- [ ] an in-flight conversation can be adopted without losing what already happened
- [ ] re-running any import or migration is a no-op, not a duplication

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-08-07 08:50Z` @nick-delirium: reindexed: I want to make a tool for llm agents, that should help with keeping long term memory and planning of features/tasks. Its named "dollie". Tool should… [7 command(s)]
  full: `steps.md#0001`
- `2026-08-07 08:50Z` @nick-delirium: reindexed: addition - its not gref its graft -> https://github.com/nanonets/graft [38 file(s), 10 command(s)]
  files: `package.json`, `tsconfig.json`, `.gitignore`, `LICENSE`, `src/core/types.ts`, `src/core/fsx.ts` +32 more · full: `steps.md#0002`
- `2026-08-07 08:50Z` @nick-delirium: reindexed: make global and local installment a setting, change it to local by default. Also few questions, followups: change mentions of me to "nick-delirium" (… [10 file(s), 7 command(s)]
  files: `src/core/types.ts`, `src/core/store.ts`, `src/core/md.ts`, `src/core/task.ts`, `src/core/housekeep.ts`, `src/core/render.ts` +4 more · full: `steps.md#0003`
- `2026-08-07 08:50Z` @nick-delirium: reindexed: can we also add an option to reindex current conversation to attach dollie to ongoing dialogues in claude code? this can also be used when we update… [11 file(s), 3 command(s)]
  files: `src/core/transcript.ts`, `src/core/task.ts`, `src/reindex.ts`, `src/migrate.ts`, `src/cli.ts`, `src/core/store.ts` +5 more · full: `steps.md#0004`
- `2026-08-07 08:51Z` @nick-delirium: spec → v2. reindexed from session faa33f88 — replacing the mechanical import with the real spec
  previous version kept in `spec.md`
- `2026-08-07 08:51Z` @nick-delirium: Added dollie reindex (adopt an in-flight conversation from its Claude Code transcript) and dollie migrate (store-format upgrade). Fixed four defects dogfooding exposed: ~/.dollie shadowing every project store, 38-file dumps in the short log, marker injection truncating blocks, and user-local agent settings leaking into the shared store.
  full: `steps.md#0005`
- `2026-08-07 08:51Z` @nick-delirium: status working → validating. review: digest accuracy on this session, the four fixes, and whether imported-step summaries are useful. 41 tests pass; migrate is only covered by a synthetic downgrade fixture.
- `2026-08-07 08:51Z` @nick-delirium: Fixed --criteria comma-splitting: prose flags now keep their commas (repeated() vs list()), tags and file paths still split. Found by using the tool on itself.
  files: `src/core/args.ts`, `src/cli.ts`, `tests/install.test.mjs`
- `2026-08-07 09:06Z` @nick-delirium: status validating → working. continuing: logs now record agent output, sessions tracked
- `2026-08-07 09:06Z` @nick-delirium: Logs now record agent output instead of user requests: summaries come from the agent's own wrap-up message, with a work-chain fallback. Added session tracking + dollie continue, Stop-hook auto-logging with duplicate suppression, tiered context reads (--brief / -n 0), and hook registration in the file-based install.
  full: `steps.md#0007`
- `2026-08-07 09:13Z` @nick-delirium: Logged pre-refactor state before renaming dollie->dolly. Confirmed the automatic wiring works unaided this session: SessionStart injected the task index, MCP registered 15 tools, skills and 9 slash commands all loaded from the file-based install.
  full: `steps.md#0008`
- `2026-08-07 09:19Z` @nick-delirium: retitled: "Build Dollie agent tool for memory and task planning" → "Build dolly: agent memory and task planning".
- `2026-08-07 09:19Z` @nick-delirium: Renamed dollie->dolly across 45 files with a real upgrade path: dolly migrate now moves .dollie/->.dolly/ and rewrites parsed block markers (leaving prose intact), install strips its own pre-rename footprint, and a dollie bin alias plus legacy env fallbacks keep running agents alive. Added dolly retitle to close the gap the rename exposed.
  files: `.claude-plugin/marketplace.json`, `.claude-plugin/plugin.json`, `.claude/commands/dolly/adopt.md`, `.claude/commands/dolly/board.md`, `.claude/commands/dolly/housekeep.md`, `.claude/commands/dolly/plan.md` +57 more · full: `steps.md#0009`
- `2026-08-07 09:21Z` @nick-delirium: Corrects step 0009: marker migration was NOT prose-safe as claimed. An unanchored regex rewrote inline dollie: mentions inside step 0009's own notes, inverting their meaning, and made migrate non-idempotent. Now anchored to line-start plus a known-marker allowlist, so quoted text can neither be altered nor promoted into structure.
  files: `src/migrate.ts`, `tests/migrate.test.mjs` · full: `steps.md#0010`
- `2026-08-07 09:21Z` @nick-delirium: status working → validating. rename dollie->dolly complete. Check: (1) the store at .dolly/ with 10 steps and spec history intact, (2) step 0010 correcting step 0009's falsified prose, (3) that the project DIRECTORY is still named dollie on purpose, (4) whether to keep the dollie bin alias + legacy env fallbacks or drop them now. 56 tests pass. MCP tool names only switch to dolly_* on your next session.
- `2026-08-07 09:31Z` @nick-delirium: Closed dolly's blind spot in big repos: a repo-level project brief (.dolly/project.md), cross-task links derived from the files each step recorded (dolly related), code-map detection instead of a home-grown indexer, and repo-first framing injected at session start. Also fixed non-deterministic recency ordering when timestamps tie within a second.
  files: `README.md`, `skills/dolly/SKILL.md`, `src/cli.ts`, `src/core/project.ts`, `src/core/related.ts`, `src/core/render.ts` +4 more · full: `steps.md#0011`
- `2026-08-07 09:31Z` @nick-delirium: status validating → validating. review the big-repo work: project brief for this repo, dolly related, code-map detection, repo-first prompting. 61 tests pass.
- `2026-08-07 10:26Z` @nick-delirium: Fixed silent corruption of any flag value starting with a dash: markdown bullet lists were parsed as short-flag bundles, and the t->text alias appended one literal "true" per letter t. That is why four project-brief sections were rows of true. Parser now uses one strict looksLikeFlag test at both decision points; brief rewritten through the fixed CLI as the end-to-end proof.
  files: `src/core/args.ts`, `tests/args.test.mjs` · full: `steps.md#0012`
- `2026-08-07 10:43Z` @nick-delirium: Applied the mechanical half of the review: identity split out of the shared config (it was misattributing every teammate), MCP context gap, hook session pinning, one log parser fixing both related-tasks gaps, title sanitising, auto-housekeep no longer archiving live work, non-destructive pruning default, and 9 slash commands reduced to thin wrappers to stop rule drift.
  files: `commands/adopt.md`, `commands/board.md`, `commands/housekeep.md`, `commands/plan.md`, `commands/resume.md`, `commands/spec.md` +15 more · full: `steps.md#0013`
- `2026-08-07 10:56Z` @nick-delirium: Store carries a real schema version and migrations became an ordered chain: lossless hops apply themselves on any command, risky ones warn until a human runs dolly migrate, and a store written by a newer dolly refuses writes so version skew cannot silently corrupt a shared store. Found and fixed that a hand-migrated store never got stamped and would re-evaluate the chain forever.
  files: `.claude/commands/dolly/adopt.md`, `.claude/commands/dolly/board.md`, `.claude/commands/dolly/housekeep.md`, `.claude/commands/dolly/plan.md`, `.claude/commands/dolly/resume.md`, `.claude/commands/dolly/spec.md` +15 more · full: `steps.md#0014`
- `2026-08-07 11:06Z` @nick-delirium: dolly reads its version from package.json instead of four hardcoded copies, releases are tagged, and a cached, detached update check tells a human at a terminal when they are behind — never an agent, never a protocol stream, never blocking. Tests caught a missing repository field and a suppression predicate that read process.env directly and so could not be tested inside an agent.
  files: `README.md`, `package.json`, `src/cli.ts`, `src/core/pkg.ts`, `src/core/update.ts`, `src/mcp.ts` +1 more · full: `steps.md#0015`

