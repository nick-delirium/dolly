<!-- dolly spec · task 0003 -->
# Spec — Setup wizard for dolly init

**current: v3** · updated 2026-08-10T08:10:33Z by @nick-delirium · superseded versions are kept at the bottom of this file

<!-- dolly:spec-current -->
<!-- v3 · 2026-08-10T08:10:33Z · @nick-delirium -->

## Problem

First contact with dolly was a flags-only command. `dolly init` printed its result and exited; every choice it made was invisible unless you already knew which flag to pass.

- **Where the store goes was not a choice at all.** `locateStore()` walked up for an existing `.dolly/`, then fell back to the git repo root. A private, per-user store only happened by setting `DOLLY_DIR` by hand — `--global` did *not* do it (it moves *agent instructions*, not the store).
- **`--local|--global` was ambiguous** — on `init` it meant instruction scope, which users read as "where does my data live".
- **The settings that matter were discovered by reading source**: `install.scope`, `install.mcp`, `reindex.autoLog`, housekeeping windows, the identity handle.
- **Detection was silent** — `installTargets` with no ids installed into every detected agent and told you afterwards.
- **"Local" was not recorded anywhere.** A project deliberately keeping its store in the repo and a project dolly had never seen looked identical, and there was nowhere to answer "which projects does dolly know about?".

## Goal

Running `dolly init` in a terminal opens a short setup screen instead of doing something silently: where task memory lives, which detected agents to wire, whether the MCP server and hooks are registered, where agent instructions go, the handle, the housekeeping windows. Every prompt opens on dolly's current behaviour, so pressing enter through the whole screen is exactly the old `dolly init`. Flags pre-fill answers rather than bypassing the screen. `dolly setup` reopens it with current values.

Keeping task memory out of the repo is a real, persistent choice: the store is created under `~/.dolly/projects/`, the decision is recorded in a registry there, and every later `dolly` command run anywhere inside that project resolves to it — with nothing written into the repo itself. Switching back moves the store home, tasks intact.

And the choice is legible afterwards to all three audiences: dolly resolves it, the user sees it in `dolly board`, `dolly whoami` and `dolly projects`, and the agent is told at session start — because the shipped instruction block says task memory is a committed `.dolly/`, which is false for an out-of-repo store.

Without a terminal dolly does not guess: a bare invocation fails naming `--yes` and the flags, while an invocation already carrying flags runs non-interactively exactly as before.

## Scope

**In:**
- Hand-rolled prompt primitives (single-select, multi-select, confirm, text) with arrow-key raw mode and a numbered fallback. Zero runtime dependencies, IO injectable so tests drive them.
- The wizard flow: store location · agents · MCP · hooks · `install.scope` · identity · `reindex.autoLog` · housekeeping windows, then the closing offers (`dolly project init`, `git add .dolly/`) and a summary.
- A project registry at `~/.dolly/projects/index.json`: `{path, local, store, created}` per project, recording **both** choices. Written at setup and self-healing on the first write to any store, so a clone of a teammate's repo registers itself.
- Resolution: `DOLLY_DIR` → nearest `.dolly/` → the recorded store → repo root → `~/.dolly/projects/<name>-<hash>`. The registry is consulted only when no `.dolly/` was found; disk wins, and a disagreement is reported rather than silently resolved.
- Moving a store between in-repo and out-of-repo, tasks intact, registry updated, nothing left behind.
- `dolly init` interactive on a TTY; `dolly setup`; `--yes`; `--store local|global`.
- `dolly projects [--json] [--prune]` — every known project, whether its store is in the repo, task count, last activity.
- Discoverability of an out-of-repo store in the board header, `dolly whoami`, the SessionStart injection, and the store's own README.
- Docs: README, `dolly help`, the agent instruction block and `skills/dolly/SKILL.md` where they assert `.dolly/` is committed.

**Out:**
- A full-screen TUI, alternate screen buffer, mouse, or theming beyond the existing `color` helpers.
- Any MCP surface for the wizard — `src/mcp.ts` mirrors the CLI 1:1 and this is the deliberate exception; a JSON-RPC stream must never be prompted.
- Creating a first task, or writing the project brief's body (the wizard only offers to run `dolly project init`).
- Changing what `installTargets` writes, adding agent targets, or editing the instruction block beyond the store-location claim.
- Editing the repo's own `.gitignore`, or committing anything. Staging at most, on request.
- Multi-store / workspace setups: one project maps to at most one store.
- Making the registry authoritative over an on-disk `.dolly/`, or a store-schema migration (the registry lives outside every store; old entries are normalised on read).

## Success Criteria

- [ ] `dolly init` with no flags on a TTY opens the wizard; enter through every prompt produces the same store as today's `dolly init`
- [ ] `dolly init --agents claude --no-mcp` on a TTY still opens the wizard with those answers pre-selected
- [ ] `dolly init --yes` skips the wizard and prints no prompt
- [ ] a bare `dolly init` with no TTY exits non-zero naming `--yes` and the flags; it never prompts and never hangs
- [ ] `dolly init --agents claude` with no TTY runs the old path unchanged (`tests/install.test.mjs` green, unmodified)
- [ ] choosing an out-of-repo store creates `~/.dolly/projects/<name>-<hash>`, records it, and a later `dolly board` from any subdirectory resolves to it with `git status` clean
- [ ] switching either way moves every task, keeps ids and step counts, leaves one store on disk, and updates the registry
- [ ] resolution order is `DOLLY_DIR` → `.dolly/` walking up → recorded store → repo root → hashed global, and a `.dolly/` on disk beats a recorded store for the same directory
- [ ] a registry entry pointing at a store that is gone falls through instead of erroring; a corrupt entry is skipped
- [ ] a repo-local store is recorded as `local: true` — by setup, and by the first write in a repo cloned from a teammate
- [ ] reading (`board`, `whoami`, `projects`) never writes the registry
- [ ] a store pinned by `DOLLY_DIR` is never recorded, and the wizard leaves it where it is
- [ ] a recorded out-of-repo store plus a committed `.dolly/` resolves to the repo's and warns on stderr, never on stdout or a hook's JSON
- [ ] `dolly projects` lists each project with in-repo/private, task count and last activity, marks the current one, shows a missing store, and `--prune` forgets it
- [ ] an out-of-repo store is stated in the board header, `dolly whoami`, the SessionStart context and the store's README; a repo-local one says none of that and still says to commit it
- [ ] `dolly setup` prefills from disk; enter-through changes no file
- [ ] the numbered fallback reaches the same result as the arrow-key path
- [ ] Ctrl-C exits non-zero, restores the terminal, and leaves no partial store
- [ ] `dolly mcp` exposes no wizard tool and never prompts
- [ ] `npm test` passes with no new runtime dependency

## Changes

- `src/prompt.ts` **(new)** — prompt primitives over an injectable `Term`; raw-mode arrow keys via `readline.emitKeypressEvents`, numbered fallback chosen by capability; restores the terminal on exit, `^C` and `SIGINT`.
- `src/wizard.ts` **(new)** — the flow, applying answers through `core/` and `installTargets`, then the summary.
- `src/core/tty.ts` **(new)** — `notAHuman()`, shared by the update notice and the wizard.
- `src/core/store.ts` — `ProjectEntry` registry (`recordProject`, `forgetProject`, `projectEntry`, `readProjectIndex` with tolerant normalisation of the first shape), `linkedStore`, `storeConflict`, `moveStore` (copy → verify → remove, refusing a non-empty destination), `kind: 'linked'`, `dollyHome()` honouring `DOLLY_HOME`, `Store.inProject`, self-registration in `Store.init()`, and a store README that tells the truth for an out-of-repo store.
- `src/cli.ts` — interactive `cmdInit`, `setup`, `projects`, `--yes`, `--store`, the conflict warning, `whoami` reporting in-repo-ness, help text.
- `src/core/render.ts` — `storeNote()` and `renderProjects()`.
- `src/core/update.ts` — `suppressed()` delegates its CI/agent/no-terminal half to `core/tty.ts`.
- `src/install.ts` — resolves the user's home per call rather than at module load, so a caller redirecting `HOME` is honoured (and tests stop writing into the developer's real `~/.claude`).
- `src/mcp.ts` — comment recording the deliberate absence of a wizard tool.
- `src/templates/instructions.ts`, `skills/dolly/SKILL.md` — the `.dolly/`-is-committed claim gains its exception.
- `tests/prompt.test.mjs`, `tests/wizard.test.mjs`, `tests/store-index.test.mjs`, `tests/projects.test.mjs` **(new)**.
- No store migration: `STORE_VERSION` stays 4.

## Risks

- **Hard-failing a bare non-TTY `dolly init` breaks existing callers.** Mitigated by failing only the *bare* invocation; any flag takes the old path, and the error names `--yes`. Fallback if it bites: defaults plus a stderr notice, a one-line change.
- **Moving a store can lose tasks.** Copy → verify task list → remove source; refuse a non-empty destination; confirm with both paths shown.
- **A stale registry entry.** Never authoritative: a `.dolly/` on disk wins, a missing target falls through, a corrupt entry is skipped, and a real disagreement is reported. `--prune` cleans up.
- **Self-registration writes to `~/.dolly` from ordinary commands.** Only on writes, only when the entry actually changes, never for a `DOLLY_DIR` store.
- **Raw mode is not universally available** (Windows, mintty, `TERM=dumb`, IDE terminals). The numbered fallback is a first-class path with its own tests. Windows is unverified.
- **An out-of-repo store silently ends teammate sharing** — the premise the store exists for. Stated at the moment of choosing and in every place the store is displayed thereafter.
- **Two checkouts of one repo** — keyed by realpath, so a symlinked or bind-mounted checkout resolves to one entry.

## Test Plan

**Unit — prompts** (`tests/prompt.test.mjs`): arrow movement and wrapping; space/a/n in multi-select; pre-checked values; enter takes the default in all four types; garbage re-asks in the fallback; `^C` rejects; long lines clipped so a redraw keeps its row count.

**Unit — registry and resolution** (`tests/store-index.test.mjs`, `tests/projects.test.mjs`): link and resolve from any depth; precedence with `DOLLY_DIR`, a real `.dolly/`, a recorded store and the repo root; missing target falls through; corrupt entry skipped; old index shape reads and upgrades on write; `created` survives a change of mind; recording twice writes nothing; `DOLLY_DIR` never recorded; reads never write.

**Integration — wizard** (`tests/wizard.test.mjs`, scripted `Term`, temp `HOME` and `DOLLY_HOME`): enter-through equals the old `init` byte for byte; every non-default answer lands in the file that owns it; flags pre-fill; re-run is a no-op; move in both directions with a task and a step surviving; move declined; move refused into a non-empty directory; cancel writes nothing; dry run writes nothing; numbered path equals arrow-key path.

**Integration — visibility**: board header, `whoami`, SessionStart JSON and store README for both kinds; conflict warning on stderr only and never inside a hook's JSON; `dolly projects` listing, `--json`, missing store, `--prune`.

**Integration — the CLI gate**: bare non-TTY `init` exits non-zero naming `--yes`; `--yes` and flagged runs unchanged; `setup` requires a terminal; an agent (`CLAUDECODE=1`) gets the refusal, never a prompt; `dolly mcp` lists no wizard tool.

**Manual**: real terminal for the arrow-key path, then `TERM=dumb` for the fallback; `^C` at first, middle and last prompt with the terminal usable afterwards; out-of-repo store leaving `git status` clean and resolving from a nested directory; macOS, Linux, and Windows (PowerShell + git-bash) for raw mode; a narrow terminal for redraw.
<!-- /dolly:spec-current -->

---

## Superseded versions

<!-- dolly:spec-history -->
## v2 — 2026-08-10T07:30:57Z · @nick-delirium

> superseded by v3: Registry now records local:true as well as out-of-repo stores, so 'in the repo on purpose' is a fact rather than an absence, and projects self-register on first write (a teammate's clone appears without setup). Resolution order deliberately NOT inverted to registry-first: a clone has no entry so it would fall through anyway, and a stale entry would shadow a working .dolly/. Disagreements are reported instead. Adds dolly projects as the way to read the registry, and the discoverability fixes for board/whoami/session-start/store README.

# Setup wizard for dolly init

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

## Decisions (from planning Q&A)

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

## v1 — 2026-08-10T07:24:55Z · @nick-delirium

> superseded by v2: planning finished — spec derived from plan.md

# Setup wizard for dolly init

_Spec is being written by the planning interview. See `plan.md`._
<!-- /dolly:spec-history -->
