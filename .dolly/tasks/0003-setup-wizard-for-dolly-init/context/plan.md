<!-- dolly plan · created 2026-08-10T07:24:55Z · @nick-delirium -->
# Plan — Setup wizard for dolly init

> Interview record. Every section below must be answered before `dolly plan finalize`.
> Gate: `dolly plan check` fails while a section is empty, `_TBD_`, or an Open Question is unchecked.

## Brief

It's an improvement of initial setup inside a repo where dolly should show a cli setup screen for users to pick basic settings like saving .dolly globally or locally etc

## Problem

First contact with dolly is a flags-only command. `dolly init` prints its result and exits; every choice it makes is invisible unless you already knew which flag to pass:

- **Where the store goes is not a choice at all.** `locateStore()` walks up for an existing `.dolly/`, then falls back to the git repo root. A private, per-user store only happens by setting `DOLLY_DIR` by hand — `--global` does *not* do it (it moves *agent instructions*, not the store). A user who does not want `.dolly/` in a shared repo has no supported way to say so.
- **`--local|--global` is ambiguous.** On `init` it means instruction scope. Users read it as "where does my data live". Two different axes wear one flag name.
- **The settings that matter are discovered by reading source.** `install.scope`, `install.mcp`, `reindex.autoLog`, `reindex.autoLogOnlyWhenWorking`, housekeeping windows and the identity handle all have real consequences (auto-logged steps, hook installation, who gets attributed) and are all invisible at setup time.
- **Detection is silent.** `installTargets` with no ids installs into every detected agent. The user is told after the fact, never asked.

Evidence: `dolly init` has no interactive path anywhere in `src/cli.ts` (`cmdInit`, cli.ts:272); the README documents flags; and the only recorded way to relocate a store is the `DOLLY_DIR` env var read at store.ts:78.

## Goal

Running `dolly init` in a terminal opens a short setup screen instead of doing something silently. The user picks where task memory lives (this repo, committed and shared with teammates — or `~/.dolly/projects/`, private to them), which detected agents to wire up, whether the MCP server and the SessionStart/Stop hooks get registered, where agent instructions are written, their attribution handle, and the housekeeping windows. Every prompt is pre-answered with what dolly does today, so pressing enter through the whole screen is exactly the current `dolly init`. Flags pre-fill answers rather than bypassing the screen.

Choosing a global store is a real, persistent choice: the store is created under `~/.dolly/projects/`, the repo path is recorded in an index there, and every later `dolly` command run anywhere inside that repo resolves to it — with nothing written into the repo itself. Switching back moves the store home.

`dolly setup` reopens the same screen later with current values filled in, so the local↔global switch and every other setting stay changeable. Without a terminal, dolly does not guess: a bare invocation fails with a message naming `--yes` and the flags, while any invocation that already carries flags runs non-interactively exactly as it does today.

## Scope

**In:**
- Hand-rolled prompt primitives (single-select, multi-select, confirm, text) with arrow-key raw mode and a numbered-prompt fallback. Zero runtime dependencies, IO injectable so tests drive them.
- The wizard flow itself: store location · agents to wire · MCP · hooks · `install.scope` · identity handle · `reindex.autoLog` · housekeeping windows.
- Global-store support as a first-class location: `~/.dolly/projects/<name>-<hash>` plus `~/.dolly/projects/index.json` mapping repo path → store, consulted by `locateStore()` between "found by walking up" and "repo root".
- Moving an existing store between local and global, tasks intact, index updated, no second store left behind.
- `dolly init` becomes interactive on a TTY; `dolly setup` runs the same wizard against an existing store with current values prefilled; `--yes` opts out.
- Non-TTY policy: bare invocation fails with a hint; any flagged invocation keeps today's behavior.
- Closing actions: offer `dolly project init`, offer `git add .dolly/` when local and in a git repo, print a summary of what was written and what to run next.
- Docs: README, `dolly help`, and the agent instruction block where they describe setup.

**Out:**
- A full-screen TUI, alternate screen buffer, mouse, or colored theming beyond the `color` helpers already in `cli.ts`.
- Any MCP surface for the wizard. `src/mcp.ts` mirrors the CLI 1:1 today; the wizard is the deliberate exception — a JSON-RPC stream must never be prompted.
- Creating a first task, editing task content, or writing the project brief's body (the wizard only offers to run `dolly project init`).
- Changing what `installTargets` writes, adding agent targets, or touching the instruction block text.
- Editing the repo's own `.gitignore`, or committing anything. Staging at most, on request.
- Multi-store / workspace setups: one repo maps to at most one store.
- A store schema change. The global index lives outside any store, so `STORE_VERSION` and `src/migrate.ts` are untouched unless implementation proves otherwise.
- Reconfiguring by editing `.dolly/**` by hand — everything still goes through the CLI.

## Success Criteria

- [ ] `dolly init` with no flags on a TTY opens the wizard; pressing enter through every prompt produces byte-identical results to today's `dolly init` (same files written, same config.json)
- [ ] `dolly init --agents claude --no-mcp` on a TTY still opens the wizard, with those answers pre-selected
- [ ] `dolly init --yes` skips the wizard entirely and takes the flag/config defaults
- [ ] a bare `dolly init` with no TTY exits non-zero with a message that names `--yes` and the available flags; it never prompts and never hangs
- [ ] `dolly init --agents claude` with no TTY runs the old non-interactive path unchanged (existing tests/install.test.mjs stays green untouched)
- [ ] choosing a global store creates `~/.dolly/projects/<name>-<hash>`, writes the repo path into `~/.dolly/projects/index.json`, and a later `dolly board` from any subdirectory of that repo resolves to that store
- [ ] with a global store linked, nothing new exists inside the repo — `git status` is clean
- [ ] switching global→local (and local→global) moves every task, keeps ids and step counts, leaves exactly one store on disk, and updates or removes the index entry
- [ ] `locateStore()` precedence is `DOLLY_DIR` → `.dolly/` found by walking up → global index → repo root → global-by-hash, and a store found by walking up still wins over a stale index entry
- [ ] `dolly setup` on an existing store prefills every prompt from current config.json/local.json; enter-through changes no file
- [ ] the same wizard flow completes over the numbered fallback when raw mode is unavailable, reaching the same result as the arrow-key path (verified by a scripted-IO test running both)
- [ ] Ctrl-C at any prompt exits non-zero, restores the terminal out of raw mode, and leaves no partially created store or half-written config
- [ ] `dolly mcp` exposes no wizard tool and never writes a prompt to stdout
- [ ] the wizard's last screen lists every file it wrote and where the store is, then the next commands to run
- [ ] `git add .dolly/` is offered only when the store is local and the project is a git repo, and nothing is ever committed
- [ ] `npm test` passes with no new runtime dependency in package.json

## Changes

- `src/prompt.ts` **(new)** — prompt primitives: `select`, `multiselect`, `confirm`, `text`. Takes an injected `{ input, output, isTTY, rawCapable }` so tests drive it with scripted keystrokes. Raw-mode arrow/space/enter path plus numbered fallback; restores the terminal on exit, `^C` and `SIGINT`. Lives in the CLI layer, not `core/` — `core/` never prints. *(guess: ~200 lines)*
- `src/wizard.ts` **(new)** — the flow. Reads current state (store location, `config.json`, `local.json`, `detectTargets()`), asks the questions, returns a plan of changes, applies it via `core/` + `installTargets`, prints the summary. Pure enough that the flow is testable with a scripted prompt driver.
- `src/core/store.ts` — global index: `~/.dolly/projects/index.json`, with `readProjectIndex()` / `linkProject(project, root)` / `unlinkProject(project)`. `locateStore()` gains an index lookup between the walk-up and the repo-root fallback. `globalStoreFor()` already produces the right path and is reused. New `moveStore(from, to)`: copy → verify → remove, refusing a non-empty destination.
- `src/cli.ts` — `cmdInit` gains the interactive path and the non-TTY hint; new `setup` command routed in the top-level switch (cli.ts:1204 area) and added to `NO_AUTO` (cli.ts:138) so housekeeping does not run mid-wizard; `--yes`/`-y` in `installOpts` and help text; help text for `init` and `setup` rewritten.
- `src/core/update.ts` — the suppression predicate (`update.ts:82-91`, already covers `CI`, `CLAUDECODE`, `NO_UPDATE_NOTIFIER`, not-a-terminal) is factored out or re-exported as the shared "is this a human at a terminal" check so the wizard and the update notice agree. *(guess)*
- `src/mcp.ts` — deliberately unchanged; add a comment recording that the wizard is the one CLI command with no MCP mirror.
- `tests/prompt.test.mjs` **(new)**, `tests/wizard.test.mjs` **(new)**, `tests/store-index.test.mjs` **(new)**; `tests/install.test.mjs` must stay green unmodified.
- `README.md`, `src/templates/instructions.ts`, `skills/dolly/SKILL.md` — document `dolly setup`, the two store locations, and `--yes` for scripts. *(guess: instruction block only needs the store-location sentence)*
- `src/migrate.ts` / `STORE_VERSION` — expected untouched: the index lives outside every store and an absent index is indistinguishable from "no global stores yet". Revisit only if the index turns out to need versioning.
- `package.json` — no dependency added. Zero-dep invariant holds.

## Risks

- **Hard-failing a bare non-TTY `dolly init` breaks existing callers.** Any script, Dockerfile, CI job or agent that runs `dolly init` with no arguments starts exiting non-zero. Mitigation: only the *bare* invocation fails — any flag present (`--yes`, `--agents`, `--no-agents`, `--local/--global`, `--no-mcp`, `--no-hooks`, `--dry-run`) takes the old path; the error text names `--yes`; README and the agent instruction block get the flag. Fallback if it bites: downgrade to defaults-plus-stderr-notice, which is a one-line change.
- **Moving a store can lose tasks.** local↔global is a directory move of the only copy of the user's memory. Mitigation: copy → verify (task count and ids match) → remove source; refuse a non-empty destination; print the source and destination before doing it and require confirmation; never move while a `*.tmp-*` file exists.
- **A stale index entry silently points at the wrong store.** Repo moved, renamed, or cloned to a second path. Mitigation: a `.dolly/` found by walking up always wins over the index; a missing index target is treated as unlinked and falls through to the repo root rather than erroring; `dolly config`/status output prints the resolved store path and how it was resolved.
- **Two checkouts of the same repo share one global store** (different paths → different index keys, so they do not — but a bind-mounted or symlinked path can collide). Mitigation: key on the realpath of the project root.
- **Raw mode is not universally available.** Windows terminals, mintty/git-bash, `TERM=dumb`, some CI shells and IDE-embedded terminals. Mitigation: the numbered fallback is a first-class path with its own test, selected by capability detection, not by platform sniffing.
- **A terminal left in raw mode after a crash** makes the shell unusable. Mitigation: restore in a `finally` plus `process.on('exit'|'SIGINT')`; test that the restore runs on the throw path.
- **A global store silently ends teammate sharing** — the premise the store exists for. Mitigation: the option text states the tradeoff at the moment of choosing, and the final summary repeats it.
- **Scope creep into a TUI framework.** The zero-dependency invariant is stated in the project brief. Mitigation: prompt primitives capped at four types; anything needing more is out of scope.
- **`init` becoming interactive changes a command agents already invoke.** Mitigation: agent-driven runs are non-TTY *and* usually flagged, so they take the old path; `CLAUDECODE` is in the suppression predicate.

## Test Plan

**Unit — prompt primitives** (`tests/prompt.test.mjs`, scripted input, captured output)
- arrow keys move the cursor and wrap at both ends; enter returns the highlighted value
- space toggles in multi-select; enter returns every checked value; zero-checked is allowed where the flow allows it
- empty input returns the prefilled default, for each of the four prompt types
- an out-of-range or garbage answer in the numbered fallback re-asks instead of throwing
- `^C` / `SIGINT` rejects, and the raw-mode restore runs on that path and on a thrown error
- capability detection picks the numbered path when raw mode is unavailable

**Unit — store index** (`tests/store-index.test.mjs`)
- `link` → `locateStore()` from the project root and from a nested subdirectory both resolve to the global store
- precedence: `DOLLY_DIR` beats everything; a real `.dolly/` found by walking up beats the index; index beats repo root
- index entry pointing at a deleted directory falls through to the repo root, no throw
- `unlink` restores repo-root resolution
- two different project paths get two different entries; the same path re-linked overwrites rather than duplicating

**Integration — wizard flow** (`tests/wizard.test.mjs`, scripted prompt driver, temp repo)
- enter-through on a fresh repo == today's `dolly init`: same files, same `config.json` content
- every non-default branch: global store · subset of agents · MCP off · hooks off · instruction scope global · autoLog off · custom housekeeping windows — each lands in the right file (`config.json`, `local.json`, `.claude/settings.json`, `.mcp.json`)
- the same script run over the arrow-key driver and the numbered driver produces identical results
- re-run (`dolly setup`) prefills from disk and enter-through leaves every file byte-identical
- store move local→global→local: task count, ids, step counts and `steps.md` content survive; one store on disk; index correct at each stage
- move refuses a non-empty destination and leaves both sides untouched
- identity answer lands in gitignored `local.json`, never in `config.json` (the misattribution guard from task 0001)

**Integration — non-interactive**
- bare `dolly init`, no TTY → non-zero exit, message contains `--yes`
- `dolly init --yes`, no TTY → succeeds, no prompt bytes on stdout
- `dolly init --agents claude`, no TTY → identical to current behavior; `tests/install.test.mjs` passes unmodified
- `dolly mcp` handshake: no wizard tool listed, no prompt on stdout

**Manual**
- real terminal, arrow-key path end to end; then `TERM=dumb` for the fallback
- `^C` at the first, middle and last prompt — terminal usable afterward, no partial store
- global store chosen: `git status` clean in the repo; `dolly board` works from a nested directory
- macOS Terminal/iTerm, Linux, and Windows (PowerShell + git-bash) at minimum for raw-mode behavior
- narrow terminal (~40 cols) and a long agent list — output does not corrupt on redraw

## Open Questions

- [x] Where does a global store live and how is the choice remembered? → ~/.dolly/projects/<name>-<hash> + projects/index.json keyed by repo path
- [x] Interactive by default, or a separate command? → dolly init is always interactive on a TTY; flags prefill; dolly setup reopens it
- [x] Prompt UI? → hand-rolled arrow-key select with numbered fallback, zero deps
- [x] Which settings? → store location, agents, MCP, hooks, install.scope, identity, autoLog, housekeeping windows
- [x] Non-TTY behaviour? → bare invocation fails with a hint naming --yes; any flagged invocation keeps today's non-interactive path
- [x] Re-run behaviour? → reconfigure with current values prefilled; store location change moves the directory
- [x] Closing actions? → offer dolly project init, offer git add .dolly/ when local+git, print a summary; no first-task prompt

## Q&A

**Q (2026-08-10 07:29Z):** Store: how is a 'global' choice remembered, given locateStore falls back to <repo>/.dolly?

**A:** Global store at ~/.dolly/projects/<name>-<hash>, with ~/.dolly/projects/index.json mapping repo path -> store dir. Nothing written into the repo, no .gitignore edit. Accepts that a moved/renamed repo loses the link (re-run the wizard to relink).

**Q (2026-08-10 07:29Z):** Where does the wizard live and when does it fire?

**A:** dolly init is always interactive on a TTY, even when flags are passed — flags prefill the answers rather than skipping the screen. dolly setup runs the same wizard later.

**Q (2026-08-10 07:29Z):** Prompt UI style, given zero runtime dependencies?

**A:** Hand-rolled arrow-key select (raw mode, live redraw, space for multi-select) with automatic fallback to numbered prompts when raw mode is unavailable.

**Q (2026-08-10 07:29Z):** Which settings does the wizard ask about?

**A:** All four groups: (1) store location + which detected agents to wire + MCP, (2) hooks and reindex autoLog, (3) install.scope for agent instructions, (4) identity handle into local.json and housekeeping windows.

**Q (2026-08-10 07:29Z):** What happens with no TTY (piped, CI, agent)?

**A:** Fail with a hint rather than silently defaulting. Refinement applied: only a BARE invocation fails — if any flag is present (--yes, --agents, --no-agents, --local/--global, --no-mcp) the old non-interactive path runs unchanged, since flags are the input the wizard would have collected. The error names --yes and the flags.

**Q (2026-08-10 07:29Z):** Re-running the wizard on an existing store?

**A:** Reconfigure: every prompt prefilled from current config.json/local.json, enter-through is a no-op. Switching store location actually moves the directory and updates the index.

**Q (2026-08-10 07:29Z):** What does the wizard do after writing settings?

**A:** Offer to run dolly project init, offer to git-add .dolly/ when the store is local and the repo is git, and close with a summary of what was written plus next commands. It does NOT offer to create a first task.

