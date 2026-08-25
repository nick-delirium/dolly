---
id: v94p7gqv
slug: setup-wizard-for-dolly-init
title: Setup wizard for dolly init
status: done
owner: nick-delirium
collaborators: [nick-delirium]
tags: []
steps: 5
spec_version: 3
created: 2026-08-10T07:24:55Z
updated: 2026-08-10T08:29:45Z
sessions: [023628c5-cdb5-4644-94cf-281ab3554cb7]
---

# v94p7gqv · Setup wizard for dolly init

<!-- dolly:header -->
`done` · spec v3 · @nick-delirium · 5 steps · updated 2026-08-10 08:29Z
<!-- /dolly:header -->

## Spec

dolly init opens a setup screen (dolly setup reopens it): store location, agents, MCP, hooks, instruction scope, handle, housekeeping — every prompt defaulted to today's behaviour, flags pre-filling rather than bypassing. Out-of-repo task memory becomes a real choice, recorded in a ~/.dolly/projects registry that carries local/global per project and self-heals on first write. Disk beats the registry; a disagreement is reported. dolly projects lists it, and the choice is stated wherever the store is shown.

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

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-08-10 07:30Z` @nick-delirium: spec → v2. planning finished — spec derived from plan.md
  previous version kept in `spec.md`

### plan finalized · 2026-08-10 07:30Z · @nick-delirium

Plan complete. Status → todo.

- plan: `context/plan.md`
- `2026-08-10 07:32Z` @nick-delirium: status todo → working.
- `2026-08-10 07:53Z` @nick-delirium: dolly init became a setup screen and out-of-repo task memory became a real choice: a ~/.dolly/projects/index.json link that locateStore checks at every level of the walk-up, so nothing lands in a repo the user asked to keep clean. Prompts are hand-rolled over an injectable Term (arrow-key raw mode, numbered fallback as a peer path), and nothing is written unless an answer actually changed it — that is what keeps enter-through byte-identical to the old init. A wizard test picked global instruction scope and wrote into the real ~/.claude, because install.ts captured os.homedir() at module load; fixed by resolving it per call and pointing HOME at a temp dir in tests.
  files: `README.md`, `src/cli.ts`, `src/core/store.ts`, `src/core/tty.ts`, `src/core/update.ts`, `src/install.ts` +6 more · full: `steps.md#0001`
- `2026-08-10 07:54Z` @nick-delirium: Setup under a DOLLY_DIR-pinned store no longer writes an index link for it — the link would have outlived the env var and kept resolving there once unset. The store-location question is skipped in that case, which is why no test caught it until one was written for the env path specifically.
  files: `src/wizard.ts`, `tests/wizard.test.mjs`
- `2026-08-10 07:54Z` @nick-delirium: status working → validating. Run `dolly setup` in a real terminal: arrow keys and redraw, then switch task memory to private and back and confirm your tasks survive the move (tests cover it, but this is the one path that touches the only copy of real memory). Also confirm the numbered fallback with TERM=dumb dolly setup, and that a bare `dolly init` in a script still fails the way you want rather than defaulting. Windows raw mode is unverified. Note: an earlier test run installed dolly instructions into your real ~/.claude (global CLAUDE.md block + skills + commands) and you chose to keep them — nothing further to do, but that is why they appeared today.
- `2026-08-10 07:58Z` @nick-delirium: An out-of-repo store now says so everywhere it is read, not just in whoami: board header, SessionStart injection, and the store's own README. The instruction block was the real defect — it asserted .dolly/ is git-tracked and told the agent to commit it, which is false for a linked store and is the highest-authority text the agent has. Board header only ever branched on kind=global, so a linked store looked ordinary.
  files: `README.md`, `skills/dolly/SKILL.md`, `src/cli.ts`, `src/core/render.ts`, `src/core/store.ts`, `src/core/tty.ts` +9 more · full: `steps.md#0003`
- `2026-08-10 08:10Z` @nick-delirium: spec → v3. Registry now records local:true as well as out-of-repo stores, so 'in the repo on purpose' is a fact rather than an absence, and projects self-register on first write (a teammate's clone appears without setup). Resolution order deliberately NOT inverted to registry-first: a clone has no entry so it would fall through anyway, and a stale entry would shadow a working .dolly/. Disagreements are reported instead. Adds dolly projects as the way to read the registry, and the discoverability fixes for board/whoami/session-start/store README.
  previous version kept in `spec.md`
- `2026-08-10 08:11Z` @nick-delirium: The registry now records local:true as well as out-of-repo stores, and a project registers itself on the first write — so a teammate's clone shows up without setup, and 'in the repo on purpose' stops being indistinguishable from 'never seen'. Kept resolution disk-first rather than registry-first: a clone has no entry so registry-first falls through anyway, and a stale entry would shadow a working .dolly/. The disagreement it was reaching for is now reported by storeConflict instead of silently resolved. dolly projects [--json] [--prune] makes the registry readable.
  files: `README.md`, `skills/dolly/SKILL.md`, `src/cli.ts`, `src/core/render.ts`, `src/core/store.ts`, `src/core/tty.ts` +10 more · full: `steps.md#0004`
- `2026-08-10 08:11Z` @nick-delirium: status validating → validating. Same as before, plus: check `dolly projects` reads right on your real machine (it will list every project you have touched with dolly, including this one). The resolution-order decision is the thing to push back on if you disagree — inverting it is a small change (locateStore in src/core/store.ts), but read the three reasons in step 0004's context first.
- `2026-08-10 08:23Z` @nick-delirium: Reviewed my own diff and found two real bugs plus a regression: --store was silently dropped whenever the wizard was skipped (so dolly init --yes --store global built a local store — exactly the path CI takes), an unrecognised --store value was ignored rather than rejected, and locateStore re-read the project registry once per ancestor directory (26 reads for one board six levels deep, zero before this feature). Also: -y was not aliased to --yes, pasted input lost every line after the first, store paths were built from an unresolved home, and the summary claimed nothing was committed after moving a store git still tracked.
  files: `README.md`, `skills/dolly/SKILL.md`, `src/cli.ts`, `src/core/args.ts`, `src/core/render.ts`, `src/core/store.ts` +12 more · full: `steps.md#0005`
- `2026-08-10 08:29Z` @nick-delirium: status validating → done.
- `2026-08-25 14:35Z` @nick.delirium: archived.

