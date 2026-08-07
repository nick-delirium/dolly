<!-- dolly spec · task 0001 -->
# Spec — Build Dollie agent tool for memory and task planning

**current: v2** · updated 2026-08-07T08:51:02Z by @nick-delirium · superseded versions are kept at the bottom of this file

<!-- dolly:spec-current -->
<!-- v2 · 2026-08-07T08:51:02Z · @nick-delirium -->

# dollie — long-term memory and feature planning for coding agents

## Problem

Coding agents forget. Every session starts blind: decisions already made get re-derived, dead ends already hit get repeated, and nothing a teammate's agent learned is visible to yours. Context windows compact and the reasoning is gone.

## Goal

Task state lives in plain markdown inside the repo, written by the agent through a CLI, committed with the code. Any agent — or human — can reconstruct what a feature is for, what has been done, why, by whom, and what is left, from files alone.

## Scope

**In:**

- Task board with statuses `todo → planning → working → validating → done`; `validating` means the agent is done and a human must verify. Agents never set `done`.
- Two-tier step log: one skimmable line per event in `task.md`, full handoff context in `context/steps.md`. Append-only.
- Versioned specs: current spec at the top of `context/spec.md`, every superseded version below it with the reason it was replaced.
- Attribution per event via GitHub handle, so the store is shareable and PR diffs read as a narrative.
- Planning mode: an interview with a completeness gate that refuses to finish while any section is `_TBD_` or any Open Question is unchecked, then derives the spec from the plan.
- Configurable housekeeping (archive, stale-flag, prune) runnable manually or automatically.
- Install into Claude Code (plugin + skills + slash commands + MCP + hooks) and into 7 other agents via instruction files and MCP entries. Scope local by default, global opt-in.
- `reindex`: adopt a conversation already in progress by reading its Claude Code transcript; `migrate`: upgrade an older store layout.

**Out:**

- Any LLM call of its own. dollie extracts facts; the agent writes prose.
- Runtime dependencies. Node >= 18, TypeScript to ESM, nothing else.
- Cross-repo or server-side state. Sharing is git, nothing more.
- Rewriting history. Corrections are new entries.

## Success Criteria

- [x] `task.md` shows spec, criteria and a chronological one-line-per-event log with timestamp, handle, summary and changed files
- [x] full step context and full spec history are recoverable after any context reset
- [x] a spec change bumps a version and preserves the previous one with its reason
- [x] planning cannot be finalized with unanswered questions
- [x] housekeeping ages out finished work without destroying summaries by default
- [x] one command wires Claude Code; other agents covered where cheap
- [x] an in-flight conversation can be adopted without losing what already happened
- [x] re-running any import or migration is a no-op, not a duplication

## Changes

- `src/core/` — store resolution, frontmatter/section/block markdown toolkit, task model, planning gate, housekeeping, transcript reader, rendering
- `src/cli.ts` — 20 commands, `--json` on everything that produces data
- `src/mcp.ts` — hand-rolled MCP stdio server, 15 tools, CLI parity
- `src/install.ts` — 8 agent targets, idempotent marker-delimited writes
- `src/reindex.ts`, `src/migrate.ts` — conversation adoption and store-format upgrade
- `skills/`, `commands/`, `.claude-plugin/` — agent-facing instructions in caveman register

## Risks

- The Claude Code transcript format is undocumented and may change. Mitigated: parsing is defensive (partial lines tolerated, missing fields defaulted) and `--file` accepts any path.
- Marker-delimited blocks can be forged by imported content. Mitigated: content is escaped on write; covered by test.
- `~/.dollie` was mistaken for a project store during walk-up, resolving every project under `$HOME` to it. Fixed by requiring store markers and excluding dollie's own home.
- The store is text, so concurrent edits by two teammates conflict like any file. Accepted: git resolves it, and the log is append-only so conflicts are additive.

## Test Plan

- Unit: frontmatter round-trip without coercing zero-padded ids; section/block mutation; marker injection cannot truncate a block.
- Integration: task lifecycle (create/step/spec/status/ref resolution/collaborators); planning gate incl. bold sub-label seeds; housekeeping archive/stale/prune/delete; transcript parsing (noise, sidechains, interrupts, thinking blocks); reindex idempotency and rebuild; migration from the pre-0.2 layout.
- CLI: install scope resolution and dotted config get/set via spawned binary.
- Manual: dogfood on this repo — adopt this very conversation, then work the task through dollie.
<!-- /dolly:spec-current -->

---

## Superseded versions

<!-- dolly:spec-history -->
## v1 — 2026-08-07T08:50:48Z · @nick-delirium

> superseded by v2: reindexed from session faa33f88 — replacing the mechanical import with the real spec

# Build Dollie agent tool for memory and task planning

> Reconstructed by `dollie reindex` from Claude Code session `faa33f88-d19e-451a-8321-307f7d37483e`.
> The requests below are verbatim; nothing here has been reviewed by a human.

## Original request

I want to make a tool for llm agents, that should help with keeping long term memory and planning of features/tasks. Its named "dollie". Tool should allow claude code for example to save summary of each major step its done to the file (ie ~/.dollie/projects) where on top there will be description/spec of current feature, then summaries of each major step thats been done with timestamp, github user, summary of work and changed files. We add github user to be able to make this shared and saved inside project/github repo, so multiple users can co-work on a single feature or be updated of whats going on. There should be a housekeeping feature that removes old/outdated/done (configurable, also can be run automatic or manual). It should also save "full context" versions alongside with full description of task and each step, additional context etc. Whenever spec of task is changing, we add appendix full file but simply change spec in short "updates" file. Next, this tool should add a planning mode, like openspec, user should be able to start planning a task by describing it, then llm should ask questions to gather more details or obtain all conditions to know success criteria, risks, what should be changed, tested, etc, after that the "task" automatically creates updates and full spec file for first feature I wrote about (which should be able to work without planning stage), should be manageable as simple todo board with statuses: todo, planning, working, validating (on this stage agent gives results to human to check the work) and done. Check how openspec, codegraph, gref and caveman projects are done on github and implement this as a tool that you can install to claude (must have) or other coding agents (cover whatever is easy). All agent instructions should follow caveman mode whenever possible without losing precise instructions and context.

## Later direction changes

### 2026-08-07T07:48:31.830Z

addition - its not gref its graft -> https://github.com/nanonets/graft

### 2026-08-07T08:19:38.666Z

make global and local installment a setting, change it to local by default. Also few questions, followups: change mentions of me to "nick-delirium" (my github username), shouldn't steps be a single file? with layout like spec/ctx at the top, then couple linebreaks, [timestam]-[username]: [update]? this makes it a bit easier to follow. Also appendix to changing feature scope can be in same file as spec itself, this way we will have less files created and its easier for human to inspect, maybe easier to work with for llm as well? I might be wrong here ofc

### 2026-08-07T08:34:56.536Z

can we also add an option to reindex current conversation to attach dollie to ongoing dialogues in claude code? this can also be used when we update versions and change for example how indexing works as well, which is what I want to test here - we will install it and test on this convo.

## Files touched in this session

- `.claude-plugin/marketplace.json`
- `.claude-plugin/plugin.json`
- `.gitignore`
- `LICENSE`
- `README.md`
- `bin/dollie-hook.mjs`
- `commands/adopt.md`
- `commands/board.md`
- `commands/housekeep.md`
- `commands/plan.md`
- `commands/resume.md`
- `commands/spec.md`
- `commands/step.md`
- `commands/validate.md`
- `package.json`
- `skills/dollie-planning/SKILL.md`
- `skills/dollie/SKILL.md`
- `src/cli.ts`
- `src/core/args.ts`
- `src/core/fsx.ts`
- `src/core/git.ts`
- `src/core/housekeep.ts`
- `src/core/identity.ts`
- `src/core/md.ts`
- `src/core/plan.ts`
- `src/core/render.ts`
- `src/core/store.ts`
- `src/core/task.ts`
- `src/core/time.ts`
- `src/core/transcript.ts`
- `src/core/types.ts`
- `src/install.ts`
- `src/mcp.ts`
- `src/migrate.ts`
- `src/reindex.ts`
- `src/templates/instructions.ts`
- `tests/helpers.mjs`
- `tests/housekeep.test.mjs`
- `tests/install.test.mjs`
- `tests/md.test.mjs`
- `tests/migrate.test.mjs`
- `tests/plan.test.mjs`
- `tests/reindex.test.mjs`
- `tests/task.test.mjs`
- `tsconfig.json`
<!-- /dolly:spec-history -->
