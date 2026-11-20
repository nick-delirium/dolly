<!-- dolly plan · created 2026-11-20T08:51:36Z · @nick-delirium -->
# Plan — Fewer commands: delete dead ones, merge the weak ones

> Interview record. Every section below must be answered before `dolly plan finalize`.
> Gate: `dolly plan check` fails while a section is empty, `_TBD_`, or an Open Question is unchecked.

## Brief

Lets delete ones that are dead already, then work on weakest ones to make them more conscise, perhaps we can unite something together to expose less commands but do roughly same.

## Problem

dolly exposes about 39 command names (35 commands plus aliases). Several are duplicates (`current` = `context current`; `show` ≈ `context` with a second renderer; `defaults` ≈ `config`), dead (`archive`/`restore` stubs), or weak and rarely used (`digest`: 0 in this repo; `memo`: 2 in 3 months). Every name costs help text, skill text, tests and agent attention. My review rated `current` 4/6, `defaults` 6/2, `digest` 6/3, `version` 7/2 and `memo` 6/4 (built/useful).

## Goal

Every command that remains earns its place, and the help, skill and MCP surface shrink to match. Removed names fail with a one-line pointer at the replacement for one version, so muscle memory and old skill text degrade gracefully instead of silently.

## Scope

**In:**
- remove: `current`, `defaults` (→ `config --defaults`), `version` (→ `--version`/`-v`), `plan show` (context shows the plan while planning), `archive`/`restore` stubs (deleted outright)
- `memo` + `digest` + `compact --tasks` → `dream` (dream is its own task, q2wsmks8; this task removes the old ones)
- `related` → `why <file...>`: the tasks that touched those files, with their latest outcome, plus commits and prose; MCP `dolly_related` → `dolly_why`
- `setup` → `init` on an existing store reopens the setup screen
- `retitle`/`rename` → `spec <ref> --title "..."`
- `show` → alias of `context` (one renderer); `show --full` → `context -n 0`
- help regrouped around what is left; hidden aliases (`ls`, `list`, `add`, `move`, `adopt`, `resume`) keep working but are not listed
- skills, commands, instruction block, README, MCP, tests updated

**Out:**
- renaming surviving commands
- removing aliases that cost nothing (`ls`, `add`, …)
- changing store layout (none needed)

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

## Changes

- `src/cli.ts`: HELP, FLAGS, dispatch, writesStore; removal stubs; cmdWhy absorbs cmdRelated; cmdInit absorbs cmdSetup; cmdSpec gets `--title`; cmdShow → cmdContext
- `src/core/render.ts`: renderShow removed; digest folding removed; `renderWhy` gets a related-tasks section
- `src/core/compact.ts`, `src/core/digest.ts`: digest half removed
- `src/mcp.ts`: `dolly_related` → `dolly_why`; `dolly_task_show` folded into `dolly_context` (guess)
- `src/templates/instructions.ts`, `skills/*/SKILL.md`, `commands/*.md`, README
- tests: removal stubs, why with several files, init on an existing store, spec --title, a docs-mention guard

## Risks

- **Old skill text installed in users' repos names removed commands.** The removal stubs give the replacement; re-running `dolly install` refreshes the text.
- **pi/opencode/zcode extensions call removed commands** (guess: they only call `hook`). grep the shipped extensions before removing.
- **Tests asserting old output break.** Update them along with the change, never delete coverage.

## Test Plan

Unit/CLI: each removal stub; `why` with several files and with no history; `spec --title`; `show` == `context`; `config --defaults`; `--version`; `init` on an existing store without a TTY applies flags.

Guard: a test that scans skills/, commands/, the README and the instruction template for removed command names.

Manual: `dolly help` reads well top to bottom.

## Open Questions

- [x] Which merges: all four groups (answered)

## Q&A

**Q (2026-11-20 08:55Z):** Which merges?

**A:** All four groups: drop duplicates (current, defaults -> config --defaults, version -> --version, plan show, archive/restore stubs); memo + digest -> dream (compact stays for one long task); related -> why <file...>; small folds (setup -> init on an existing store, retitle -> spec --title, show -> alias of context). Removed names print 'X was removed, use Y' for one version.

