<!-- dolly project brief · repo-level knowledge, maintained by agents -->
# Project brief — dollie

> What is true about this codebase. Task-independent.
> Agents: read this before planning. Correct it when you find it wrong —
> a stale brief is worse than none.

## Overview

dolly is a CLI that gives coding agents task memory: a board, an append-only step log, versioned specs, and a planning gate — all plain markdown under `.dolly/`, committed with the code.

Two audiences read every output: a human skimming a PR diff, and an agent rehydrating after a context reset. When they conflict, the agent wins on `context/*` and the human wins on `task.md`.

Must not stop being true: the store is human-readable markdown, and dolly never needs a network or a model to work.

## Architecture

- `src/core/` — the model. `store.ts` locates `.dolly/` and loads tasks; `task.ts` owns every write to a task (frontmatter, sections, log lines, spec versions, step entries); `md.ts` is the frontmatter + section + marker-block toolkit everything parses through.
- `src/cli.ts` — argument parsing and every command. Thin: it formats, `core/` decides.
- `src/mcp.ts` — MCP stdio server, hand-rolled JSON-RPC, exposing the task-memory core of the CLI. Deliberately absent: setup/init (prompting a JSON-RPC stream is a hang), continue (spawns a TUI) and the maintenance commands. Arguments are validated against each tool's own inputSchema; notifications are never answered.
- `src/prompt.ts` + `src/wizard.ts` — the interactive setup screen. `prompt.ts` is four hand-rolled prompt types over an injectable `Term` (arrow-key raw mode, and a numbered fallback that is a first-class path, not a degraded one); `wizard.ts` is the question flow and applies the answers through `core/` and `install.ts`. Both live outside `core/` because they print.
- `src/core/tty.ts` — the single "is a human watching?" predicate. Shared by the update notice and the wizard so the two can never disagree; the environment is injected, never read off `process.env`, so it is testable from inside an agent.
- `src/reindex.ts` + `src/core/transcript.ts` — reads Claude Code session transcripts to adopt a conversation already in flight.
- `src/core/project.ts` + `src/core/related.ts` — repo-level brief, and cross-task links derived from the files each step recorded.
- `src/migrate.ts` — upgrades older stores in place. Every storage change needs a migration here.
- `src/install.ts` — writes agent instructions for 10 targets, idempotently. Resolves the user's home per call, never at module load, so a caller that redirects `HOME` is honoured. dolly-owned dirs are mirrored with `syncTree` (stale files pruned); user JSON goes through `editJson` (skip + instructions on unparseable files); `--global` is honoured per target or reported as project-only.
- `src/core/home.ts` — `dollyHome()`: the one resolver for ~/.dolly (DOLLY_HOME overrides), used by the store index, identity cache and update cache.
- `skills/`, `commands/`, `.claude-plugin/` — agent-facing instructions, shipped in the npm package and doubling as the Claude Code plugin.

## Conventions

- Zero runtime dependencies. Adding one needs a real argument; the tool is small enough not to need any.
- Every command that produces data takes `--json`. Text and file flags take `-` for stdin; stdin is read ONLY on an explicit `-`.
- Every CLI command declares its flags in `FLAGS` (cli.ts): switches vs value flags, unknown flags rejected. A new flag must be added there or it errors.
- `core/` never prints. The CLI prints; core returns data or throws.
- Any JSON that is read, changed and written back (store config, local.json, index.json, every agent config install touches) goes through `readJsonForUpdate` — an unparseable file throws/skips, never gets replaced by a fallback. Plain `readJson` is for read-only values and caches.
- Comments explain WHY, never what. Load-bearing subtleties get one; obvious code gets none.
- Agent-facing prose (skills, instructions, tool descriptions) is written in a compressed register — articles and filler dropped, every command, path and flag exact.
- Tests are `node --test` against `dist/`, so `npm test` builds first. Test names state the behaviour, not the function under test.

- Context footprint is budgeted and asserted (`tests/footprint.test.mjs`): instruction block ≤2KB, skill descriptions ≤320 chars, MCP tool list <8KB, session-start small. The block holds essentials only; depth goes in the skill (`dolly guide` prints it for agents without skills). Anything injected per session or per pickup must not repeat what another injected part already says.

## Invariants

- **Markers are parsed, not decorative.** `<!-- dolly:step 0003 -->` and friends are matched by literal prefix in `md.ts`. Rename or reformat one without a migration and step context silently disappears — the log still lists steps while their bodies are unreachable. An end marker pairs only with the start BEFORE it; a start with no end is refused (`setBlock` throws), never repaired by guessing.
- **Content is escaped on write.** `neutralizeMarkers()` runs on every block write and on spec.md bodies, and `demoteHeadings()` turns `## ` lines in user content into `### ` — sections end at the next `## `, so prose headings would otherwise truncate a section.
- **Frontmatter round-trips.** `emitScalar` escapes and `scalar` unescapes the same set; a value must read back identical after any number of saves.
- **Steps are append-only.** Corrections are new entries. Nothing rewrites history, and prose is never machine-edited — it is a record of what someone actually wrote. Step numbers come from max(counter, highest block in steps.md), so a merge never reuses one.
- **Never destructive by default.** Migrations move, never overwrite, and refuse to guess when two candidates exist. Install only deletes files dolly itself ships (dolly-owned dirs, `dolly-*.md`).
- **Hooks never fail the host.** `dolly hook …` runs before the version gate inside a catch-all; a newer store makes `hook stop` a silent no-op.
- **Agents never set `done`.** `validating` is the handoff; a human closes the loop.
- **`~/.dolly` is dolly own home, never a project store** — otherwise every project under $HOME resolves to it. Everything under it resolves through `dollyHome()` (core/home.ts), so DOLLY_HOME isolates caches too.
- **Flag values are prose.** A value flag takes the next token whatever it looks like (`-m "- item"`, `-m "--force was wrong"`), unless it is exactly one of that command's own flags.

- **One writer per store.** Every write command (CLI via `writesStore`, MCP write tools, `hook stop`) holds `.local/write.lock` for its whole run, taken BEFORE it loads anything — so every load is fresh. Library functions do not lock; entry points do.
- **Auto-log follows the conversation.** `hook stop` writes only to a task whose `sessions` contains the running session (`sessionTask`); `current` prefers that task, then your own. Any dolly write attaches the session.

## Glossary

- **task** — one feature or fix, at `.dolly/tasks/NNNN-slug/`. The id is the stable handle; the slug follows the title.
- **step** — one major unit of work, two tiers: a one-line summary in `task.md` and full handoff context in `context/steps.md`.
- **spec version** — bumped when the full spec changes; the old one moves to "Superseded versions" in the same file with its reason.
- **segment / turn** — one human prompt plus everything the agent did before the next prompt. The unit `reindex` imports, keyed by turn uuid for idempotency.
- **work chain** — the ordered, repeat-collapsed trace of tool calls in a turn.
- **the store** — `.dolly/` itself.

