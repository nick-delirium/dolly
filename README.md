# dolly

**Task memory for coding agents, as markdown in your repo.**

dolly gives an agent a task board, a step log of what it did and why, and versioned specs — all plain files, committed with your code. So the next session picks up where the last one stopped instead of starting blind, and your teammates' agents read your history the same way yours read theirs.

Three things it does:

- **Remembers.** Every major step is logged with a timestamp, the GitHub handle who did it, the files it touched, and a full handoff note: decisions, options rejected, gotchas. With hooks installed this happens automatically.
- **Plans.** A planning interview that refuses to finish while any section is `_TBD_` or any question unanswered, then derives the spec from the answers.
- **Tracks.** `todo → planning → working → validating → done`, where `validating` means the agent is done and a human must verify. Agents never mark work done.

Installs into Claude Code (plugin, skills, slash commands, MCP, hooks) and seven other agents. Zero runtime dependencies.

```
.dolly/
  config.json
  tasks/
    0001-oauth-login/
      task.md          # meta + short spec + criteria + one line per event   ← what everyone skims
      context/
        spec.md        # current full spec on top, every superseded version below it
        steps.md       # full context of every step, append-only
        plan.md        # planning interview record (only when the task was planned)
  archive/2026-08/…    # aged-out tasks
```

Three files per task, not thirty. A task's whole history is two diffs in a PR.

## Install

Not on npm yet — install from the repo. Any of these gives you a `dolly` on your PATH; pick by whether you want to hack on it.

**Straight from GitHub** (no clone, builds itself on install):

```bash
npm install -g github:nick-delirium/dolly
```

**From a clone** — same result, but you have the source:

```bash
git clone https://github.com/nick-delirium/dolly.git
cd dolly
npm install          # builds via the `prepare` script
npm install -g .     # or `npm link` if you want edits to take effect live
```

**Working on dolly itself** — `npm link` symlinks the global `dolly` at your checkout, so a rebuild is picked up immediately:

```bash
git clone https://github.com/nick-delirium/dolly.git && cd dolly
npm install && npm link
npm test             # 72 tests
```

Undo with `npm unlink -g dolly`. Requires Node ≥ 18 and nothing else — there are no runtime dependencies, and TypeScript is the only devDependency.

Then, in whatever project you want task memory for:

```bash
cd your-project
dolly init
```

`dolly init` detects the coding agents on your machine, wires each one, and creates `.dolly/`. Commit `.dolly/` — that's the shared memory.

### Claude Code (plugin)

The plugin gives you the hooks (auto-logging, session context) without editing `.claude/` yourself:

```bash
claude plugin marketplace add nick-delirium/dolly
claude plugin install dolly@dolly
```

The plugin drives the CLI, so install that too (see above) — `bin/dolly-hook.mjs` falls back to a `dolly` on PATH and exits 0 rather than breaking your session if it can't find one.

You get:

- **skills** `dolly` (memory, step logging) and `dolly-planning` (interview) — loaded automatically when relevant
- **slash commands** `/dolly:board` `/dolly:resume` `/dolly:step` `/dolly:update` `/dolly:plan` `/dolly:spec` `/dolly:validate` `/dolly:adopt` `/dolly:housekeep`
- **MCP server** — 17 tools, so the agent can drive dolly without shelling out
- **SessionStart hook** — spec, criteria and recent events injected into every new session automatically
- **Stop hook** — auto-logs a step for each finished turn (see [Automatic logging](#automatic-logging)), and nudges when a task goes quiet

`dolly install claude` registers the same hooks in `.claude/settings.json` if you'd rather not use the plugin (`--no-hooks` to skip).

Prefer files over a plugin? `dolly install claude` writes `.claude/skills/`, `.claude/commands/dolly/`, a `CLAUDE.md` block and `.mcp.json`.

### Local or global

Instructions are written **into the project** by default, so they land in the repo alongside `.dolly/` and your teammates get them on clone. Change the default per project:

```bash
dolly config set install.scope global    # write to ~/.claude/, ~/.claude.json instead
dolly config set install.mcp false       # stop registering the MCP server
dolly install claude --local             # or override the setting for one run
```

### Other agents

```bash
dolly install --list                 # what's detected here
dolly install cursor codex gemini    # or name them
```

| Agent | What gets written |
|---|---|
| Claude Code | `.claude/skills/`, `.claude/commands/dolly/`, `CLAUDE.md` block, `.mcp.json` |
| Codex CLI | `AGENTS.md` block, `~/.codex/config.toml` MCP entry |
| Cursor | `.cursor/rules/dolly.mdc` (always-apply), `.cursor/mcp.json` |
| Windsurf | `.windsurf/rules/dolly.md` |
| GitHub Copilot | `.github/copilot-instructions.md` block |
| Gemini CLI | `GEMINI.md` block, `.gemini/settings.json` MCP entry |
| opencode | `AGENTS.md` block, `opencode.json` MCP entry |
| anything else | `AGENTS.md` block |

All writes are idempotent, delimited by `<!-- dolly:instructions -->` markers. Re-run anytime. `--dry-run` to preview, `--global` for user-level instead of project-level, `--no-mcp` to skip MCP wiring.

## Two ways in

### Small, understood work

```bash
dolly new "Fix token expiry off-by-one" --short "Expiry check uses < instead of <=."
dolly status 1 working
# … agent works …
dolly step 1 -m "Fixed comparison, added regression test." --auto-files --detail-file notes.md
dolly status 1 validating --note "run the auth suite"
```

### A feature — planning mode

```bash
dolly plan start "Replay filters" --brief "users want to filter replays by country and browser"
dolly plan check 2          # ← the agent's interview agenda; exits 1 while gaps remain
```

```
unfilled sections (8):
  Problem — What hurts today? Who feels it? Evidence (bug, metric, quote).
  Goal — One paragraph: what is true after this ships.
  Scope — In: things this change touches. Out: things it explicitly does not.
  Success Criteria — Checkable statements. Each must be verifiable by a human or a test.
  Changes — Files, modules, schemas, configs, migrations. Guesses fine — mark them.
  Risks — What can break, what is uncertain, what needs a fallback.
  Test Plan — Unit / integration / manual. Name the cases, not the framework.
  Open Questions — Anything blocking. Check the box once answered, log answer in Q&A.
```

The agent reads the codebase, asks you the rest in one batch, and records what you say:

```bash
dolly plan qa 2 -q "Country from GeoIP or profile?" -a "GeoIP at session start, already stored."
dolly plan set 2 "Success Criteria" --text "- [ ] country filter returns only matching sessions
- [ ] combined filters AND together
- [ ] p95 under 300ms on 1M sessions"
dolly plan check 2          # → plan complete
dolly plan finalize 2       # → spec + criteria generated, status → todo
```

`finalize` derives the full spec from the plan into `context/spec.md`, puts a short summary in `task.md`, and moves the task to `todo`. `plan.md` stays forever as the interview record. Blocked while any section is `_TBD_` or any Open Question unchecked — `--force` to override, then log the unknown as a Risk.

## The step log

The core idea: **two tiers per step.**

```bash
dolly step current -m "Wired the OAuth callback route." \
  --auto-files \
  --detail-file /tmp/notes.md
```

- `-m` → `task.md`. One to three lines. What humans and teammates skim.
- `--detail-file` → appended to `context/steps.md` as entry `0003`. Decisions and why, options rejected and why, gotchas, snippets, what to do next. Written for an agent with zero context.

`--auto-files` reads changed files from git (`--files a.ts,b.ts` when the tree is noisy).

Result in `task.md`:

```markdown
## Log

- `2026-08-07 10:22Z` @nick-delirium: Wired the OAuth callback route.
  files: `src/auth/callback.ts`, `src/auth/index.ts` · full: `steps.md#0003`
- `2026-08-07 11:04Z` @nick-delirium: spec → v2. security review demanded PKCE
  previous version kept in `spec.md`
- `2026-08-07 11:40Z` @nick-delirium: status working → validating. run the auth suite
```

One line per event, flat and chronological — spec changes and status moves land in the same stream as steps, so the whole history reads top to bottom. Append-only: a wrong step is corrected by a new step, never by rewriting.

`context/spec.md` works the same way — current spec at the top, each superseded version below it with the reason it was replaced:

```markdown
**current: v2** · updated 2026-08-07T11:04:00Z by @nick-delirium

<current spec>

## Superseded versions

## v1 — 2026-08-07T08:00:00Z · @nick-delirium

> superseded by v2: security review demanded PKCE

<the v1 spec, verbatim>
```

## Adopting a conversation in progress

You rarely remember to start a task before you start working. `dolly reindex` reads this project's Claude Code transcript and turns what already happened into a task:

```bash
dolly reindex            # digest — read it first
dolly reindex --apply    # import: one step per turn
```

The digest is the mechanical record the agent cannot reconstruct from a context window that may have been compacted:

```
# dolly reindex — session faa33f88

- title (from Claude Code): Build Dolly agent tool for memory and task planning
- span: 2026-08-07T07:45:47Z → 2026-08-07T08:41:20Z
- human turns: 4 (+1 interrupted/duplicate)
- tools used: Bash 48, Write 44, Edit 39, WebFetch 2, ToolSearch 1, WebSearch 1
- already imported: 0 turn(s)

## Segment 3 · 2026-08-07T08:19:38Z
turn `8434189b-8891-4597-b521-efb6c4c883fe`

### Request (verbatim)
> make global and local installment a setting, change it to local by default. …

### Files touched (10)
- `src/core/types.ts`
…
```

What it extracts: every human request verbatim (injected reminders, hook context and interrupted duplicates stripped), files written or edited per turn, commands run, tool counts, subagent turn counts, and the assistant's closing message. What it never touches: thinking blocks, tool results, subagent file writes, temp paths.

Each imported step records `source: session <id> · turn <uuid>`, so re-running is a no-op for turns already present. Flags: `--into <ref>` to attach to an existing task, `--all-turns` to keep clarification turns as their own steps, `-n N` for the last N segments, `--session <id>` / `--file <path.jsonl>` to pick a different conversation, `--list` to see them all.

**The import is deliberately mechanical.** The spec it writes is the raw requests stitched together, and it says so. The agent — which has the conversation in context — is instructed to immediately replace it:

```bash
dolly spec 1 --short "<2-5 lines>" --file spec.md --reason "reindexed from session faa33f88"
```

### When dolly's own format changes

```bash
dolly migrate                      # upgrade an older .dolly/ layout in place
dolly reindex --apply --rebuild    # re-derive imported steps from the transcript
```

`migrate` is idempotent and has a `--dry-run`. It merges pre-0.2 `context/steps/NNNN.md` files into `steps.md`, folds `spec.vN.md` appendices into `spec.md`, and repoints dead links in the short log. Un-migrated stores stay readable in the meantime — the readers fall back to the old layout.

## Big repos: one repo, many tasks

The failure mode in a large codebase is an agent treating task 0007 as a greenfield project — reinventing conventions, re-deriving the architecture, and undoing a decision task 0003 made deliberately. Three things push against that, and they are injected automatically rather than left for the agent to remember.

### The project brief

`.dolly/project.md` holds what is true about the **codebase**, independent of any task:

```bash
dolly project                                       # read it
dolly project set "Invariants" --text "<what you learned>"
```

Sections: Overview, Architecture, Conventions, Invariants, Glossary. Unfilled ones are reported so an agent knows what is still unanswered, and are never injected — a `_TBD_` heading is worse than silence.

It is **not a second CLAUDE.md**. CLAUDE.md tells an agent how to behave; the brief records what is true about the code. Instructions versus findings. The rule agents are given: *a fact useful to a task that does not exist yet belongs in the brief; a fact about what this task did belongs in a step.*

### Related tasks, by the files they touched

dolly already records the files every step touched, which makes it the only thing in the toolchain that can answer *who else has been in this code, and what did they conclude?*

```bash
dolly related 7                              # tasks sharing files with task 7
dolly related --files src/auth/token.ts      # before you edit something
```

```
tasks sharing code with 2 file(s)

- **0003 Rate limit the API** (done) — shares `src/auth/token.ts`
  last: Bucket per token; reused the token parser rather than re-parsing.
```

The index is derived from `steps.md` on every call and never stored, so it cannot go stale. `dolly context <ref>` includes it automatically, alongside the brief and the full list of files the task has touched.

Opening a task also checks for one that may already cover it — word overlap against existing titles, printed as a warning, never a block:

```
dolly: 1 existing task(s) may already cover this — check before duplicating
  0004 Add replay country filter (working) · shares: replay, filter
```

### Code maps: detected, not rebuilt

dolly does not index code, and a half-built third indexer would only be wrong more often. It detects one and tells the agent to reach for it before grep:

| Marker | Tool | What the agent is told |
|---|---|---|
| `.codegraph/` | CodeGraph | `codegraph explore "<question>"` — symbols' source plus call paths, including dynamic dispatch |
| `graft/` | graft | `graft ask "<task>"` — ranked nodes and file:line |
| `.serena/` | Serena | symbolic lookup without reading whole files |

Shown at session start and in `dolly project`. If a big repo has none, the agent is told to say so and suggest one.

### What a new session is handed

The SessionStart hook injects, before anything task-specific: *"work here is a slice of an ongoing codebase, not a new project"*, the project brief, any code map, and the last four finished tasks with their outcome lines. With no active task — exactly when a new one is about to be opened — it adds the two commands to run first: `dolly board --all` and `dolly related --files …`.

## Rehydrating — read in tiers

Neither "the short chain" nor "the full context" is right on its own. They answer different questions and differ in cost by an order of magnitude:

| Need | Command | Contains |
|---|---|---|
| what work exists | `dolly board` | one line per task |
| orienting, no code yet | `dolly context <ref> --brief` | spec, criteria, full one-line log |
| **picking up a task, about to write code** | **`dolly context <ref>`** | the above + full spec + last 3 steps' full context |
| why is this code like this | `dolly context <ref> -n 0` | every step in full |

The default is the middle one, and it is the answer to "which is better": the short log tells you *what* happened, full step context tells you *why* — and you need why before you change anything. Reading every step in full is almost always waste, since older steps were superseded by newer ones.

At session start the Claude Code hook injects spec + criteria + the last six events. That is an **index**, deliberately not the record — the injected text says so and points at `dolly context`.

## Automatic logging

Yes, it wires itself up on install. With the plugin (or `dolly install claude`), the Stop hook fires after every finished turn and appends a mechanical step for it, derived from the transcript: what the agent reported, its work chain, the files it touched. The log has no holes even when the agent forgets.

It stays out of the way of real work:

- a turn the agent logged itself is **skipped** — dolly compares the turn's start time against the task's last-updated time
- only fires while a task is `working` (`reindex.autoLogOnlyWhenWorking`)
- deduped by turn id, so nothing is logged twice

```bash
dolly config set reindex.autoLog false                 # off
dolly config set reindex.autoLogOnlyWhenWorking false  # log in any status
```

Agent-written steps are still much better, because auto-entries lift the agent's last message verbatim. The instructions tell the agent to keep logging real steps and treat auto-entries as a floor. `/dolly:update` is the manual checkpoint.

## Logs record what the agent did, not what you asked

A log of user requests is useless for continuity — the request is already in the spec. What the next session needs is what its predecessor concluded.

So a step summary is derived, in order, from: the last thing the agent told the user (that *is* its own summary), then its first message, then a description synthesised from the work chain, and only as a last resort the request. Full step context is ordered the same way:

```markdown
## What the agent said it did      ← every visible message, in order
## Work chain                      ← Read src/a.ts ×3 · Edit src/b.ts · Bash: npm test
## Files touched
## Commands run
## Request that opened the turn     ← verbatim, but demoted
```

The **work chain** is the ordered trace of what actually ran, repeats collapsed (`Read src/a.ts ×3`). Scratch files outside the project appear as `Write (outside the project)`; writes to `.dolly/` itself are dropped as circular bookkeeping.

### Thinking blocks

Off by default. `dolly reindex --include-thinking` (or `reindex.includeThinking`) captures them into a clearly labelled `## Reasoning (raw, opt-in)` section.

The honest trade-off: reasoning is verbose, frequently contradicted later in the same turn, and the conclusions that survive already appear in the visible messages and the work chain. It buys rationale that never made it into a reply — real, but low density per token. Try it on one task before enabling it globally.

## Reopening the conversation

Every step records the Claude Code session it happened in — `CLAUDE_CODE_SESSION_ID`, which is exactly the transcript's filename — so a task knows its own conversation history:

```bash
dolly continue 3           # claude --resume <latest session for task 3>
dolly continue 3 --fork    # resume as a branch, leaving the original intact
dolly continue 3 --print   # just print the command
```

From a terminal it execs `claude` directly. From inside Claude Code — where spawning an interactive TUI out of a tool call would be wrong — it prints the command and says why. Sessions appear in `dolly show <ref>` and in the frontmatter as `sessions: [...]`.

## Status board

```
todo → planning → working → validating → done
```

`validating` means the agent is finished and a **human** must verify. Agents are instructed to stop there and never set `done` themselves.

```bash
dolly board
dolly board --all --status working
dolly board --json           # for scripts
```

```
dolly · /repo/.dolly

○ TODO  (1)
  0002  Replay filters               @nick-delirium   2h ago   0✎  spec v2
◐ WORKING  (1)
  0001  OAuth login                  @nick-delirium   5m ago   3✎  #auth
◑ VALIDATING  (1)
  0004  Rate-limit the search API    @alice           1d ago   7✎
```

## Housekeeping

```bash
dolly housekeep --dry-run
dolly housekeep
```

Runs automatically at most once a day on any write. Defaults in `.dolly/config.json`:

| Key | Default | Effect |
|---|---:|---|
| `archiveDoneAfterDays` | 14 | `done` tasks untouched this long → `archive/YYYY-MM/` |
| `staleAfterDays` | 60 | unfinished tasks untouched this long → flagged `stale` |
| `deleteArchivedAfterDays` | 0 | delete archived dirs after N days. 0 = keep forever |
| `keepFullStepsPerTask` | 0 | 0 = keep every step body. Set >0 to drop the oldest past that count; the one-line summaries always survive |
| `keepSpecVersions` | 0 | 0 = keep every superseded spec version in `spec.md` |
| `auto` | true | run automatically |
| `autoEveryHours` | 24 | how often auto may run |

```bash
dolly config set housekeep.archiveDoneAfterDays 30
dolly config get housekeep
```

Nothing is destroyed by default: pruning and archive-deletion are both off unless you turn them on, archiving moves directories rather than removing them, and every spec version is kept. Automatic runs also never touch the task you are currently working on.

## Sharing and attribution

Each step and status change is stamped with your handle, resolved in this order:

```
DOLLY_USER  →  .dolly/local.json  →  gh api user (cached)  →  git user.email / user.name  →  $USER
```

`.dolly/` holds two config files and the split matters: **`config.json` is shared policy** (statuses, plan sections, housekeeping) and is committed; **`local.json` is per-person** and gitignored. Identity belongs in `local.json` — `dolly config set user` writes there. A `user` in the shared `config.json` is deliberately **ignored**, because a committed handle stamps every teammate's steps with one name and destroys the attribution the store exists to provide. `dolly migrate` moves a stale one out and reports it.

Because it's all files in the repo, two people working the same feature see each other's steps on `git pull`, and a step log shows up in PR diffs as a readable narrative of how the change happened. `collaborators` in the frontmatter accumulates everyone who touched the task.

## Where the store lives

In order: `DOLLY_DIR` → nearest `.dolly/` walking up from cwd → `<repo-root>/.dolly` → `~/.dolly/projects/<name>-<hash>` when you're not in a repo. Non-repo directories get a global store so dolly still works outside git.

## Commands

```
init [--agents a,b] [--local|--global] [--no-mcp] [--no-agents]
board | list [--all] [--status s] [--mine] [--tag t] [--json]
show <ref> [--full] [--json]
context <ref|current> [-n N] [--brief] [--json]
project [show | init | set "<Section>" --text t]
related [<ref>] [--files a,b] [--json]
continue <ref> [--fork] [--print] [--session id]
current                                    alias for: context current

new "<title>" [--short t] [--file f|-] [--status s] [--tag x] [--criteria c]
step <ref> -m "<summary>" [--files a,b | --auto-files]
           [--detail t | --detail-file f] [--status s]
spec <ref> [--short t] [--file f|-] [--criteria c] [--reason why]
status <ref> <status> [--note t]
archive <ref> [--note t] | restore <ref>

plan start "<title>" [--brief t]
plan show <ref>
plan set <ref> "<Section>" (--text t | --file f|-)
plan qa <ref> -q "<question>" -a "<answer>"
plan check <ref> [--json]
plan finalize <ref> [--file f] [--short t] [--force] [--status s]

reindex [--list] [--session id] [--file f.jsonl] [--apply] [--into ref]
        [--all-turns] [-n N] [--rebuild] [--title t] [--status s]
        [--include-thinking] [--json]
housekeep [--dry-run] [--json]
migrate [--dry-run]
config [get <key> | set <key> <value>]
whoami
install [agent…] [--list] [--local|--global] [--no-mcp] [--no-hooks] [--dry-run]
mcp                                        MCP stdio server
hook <session-start|stop>                  Claude Code hook payloads
statusline                                 one line for a statusline
```

`<ref>` is an id (`3`, `0003`), a slug, a unique substring, or `current` / `@` for the active task — the most recently touched task in `working`, else `validating`, else `planning`.

Every command that produces data takes `--json`. Text input flags accept `-` for stdin, or a piped heredoc.

## MCP tools

`dolly mcp` speaks MCP over stdio, no dependencies. Registered automatically by `dolly init` for agents that support it.

`dolly_board` · `dolly_context` · `dolly_task_show` · `dolly_task_new` · `dolly_step_add` · `dolly_spec_update` · `dolly_status_set` · `dolly_plan_start` · `dolly_plan_set` · `dolly_plan_qa` · `dolly_plan_check` · `dolly_plan_finalize` · `dolly_project` · `dolly_related` · `dolly_reindex` · `dolly_archive` · `dolly_housekeep`

## Agent instructions

Skills, slash commands and the instruction blocks written into `CLAUDE.md` / `AGENTS.md` / Cursor rules are all written in caveman register — articles and filler dropped, every command, path, flag and gate kept exact. Fewer input tokens per session, same precision.

## Contributing

```bash
git clone https://github.com/nick-delirium/dolly.git
cd dolly
npm install     # installs TypeScript, then `prepare` builds dist/
npm link        # puts `dolly` on your PATH, pointing at this checkout
npm test        # 72 tests
```

`npm install` first is **not optional**: `npm link` runs the `prepare` script, and on a fresh clone with no `node_modules` that fails with `tsc: command not found`.

After editing `src/`, rebuild — the global `dolly` resolves to `dist/cli.js`, not to your sources:

```bash
npm run build   # or `npm run dev` to watch, or just `npm test` (it builds first)
```

### After a `git pull`

```bash
npm install     # that's it
```

The link itself survives a pull: it points at the checkout *directory*, not at a snapshot. But `dist/` is gitignored, so **a pull never updates the compiled output** — your `dolly` keeps running the previous build until you rebuild. `npm install` covers both cases, since `prepare` recompiles and you can't tell from a pull whether devDependencies changed. `npm run build` alone is enough when they haven't.

This one bites silently: the symptom is a fix that "doesn't work" because you're still running a stale `dist/`.

**Re-run `npm link` only if `package.json`'s `bin` changed.** npm materialises one symlink per bin entry at link time, so a newly added or renamed binary won't be on your PATH until you link again.

Undo the link with `npm unlink -g dolly`.

The clone ships dolly's own `.claude/`, `.mcp.json`, `CLAUDE.md` and `.dolly/`, so once `dolly` is on your PATH a Claude Code session in the checkout gets the skills, slash commands, MCP server and hooks automatically — and `dolly board` shows the project's real task history. dolly is developed with dolly.

Requirements: Node ≥ 18. Zero runtime dependencies; TypeScript is the only devDependency. TypeScript → ESM.

Conventions worth knowing before a PR are in the project brief: `dolly project` (or read `.dolly/project.md`). The invariants section is the one to read first — the block markers in `context/*.md` are parsed, so changing their shape needs a migration in `src/migrate.ts`.

## Prior art

[OpenSpec](https://github.com/Fission-AI/OpenSpec) for spec-driven change folders and the archive-on-done idea. [graft](https://github.com/nanonets/graft) for git-tracked agent context and multi-agent install. [CodeGraph](https://github.com/nick-delirium/codegraph) for CLI/MCP parity. [caveman](https://github.com/JuliusBrussee/caveman) for the compressed instruction register and plugin layout.

MIT.
