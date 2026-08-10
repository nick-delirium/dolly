<!-- dolly steps · task 0003 · append-only, newest at the bottom -->
# Full step context — Setup wizard for dolly init

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001 -->
## 0001 · 2026-08-10T07:53:19Z · @nick-delirium

- task status: working
- files: `README.md`, `src/cli.ts`, `src/core/store.ts`, `src/core/tty.ts`, `src/core/update.ts`, `src/install.ts`, `src/mcp.ts`, `src/prompt.ts`, `src/wizard.ts`, `tests/prompt.test.mjs`, `tests/store-index.test.mjs`, `tests/wizard.test.mjs`

## What landed

`dolly init` is now a setup screen, `dolly setup` reopens it, and keeping task memory out of the repo is a real, persistent choice for the first time.

New files:
- **`src/prompt.ts`** — `select` / `multiselect` / `confirm` / `text` over an injectable `Term` (`write`, `key`, `line`, `raw`, `columns`, `close`). Raw path uses `readline.emitKeypressEvents`, so key decoding is free and dependency-free. The numbered path is a first-class alternative selected by capability (`isTTY && setRawMode && TERM !== 'dumb'`), never by platform.
- **`src/wizard.ts`** — the flow: store location · agents · instruction scope · MCP · hooks · handle · autoLog · housekeeping preset, then apply, then the two closing offers (project brief, `git add .dolly`), then a summary.
- **`src/core/tty.ts`** — `notAHuman()`, the one predicate for "may I talk to a person". `update.ts:suppressed()` now delegates its CI/agent/no-terminal half to it, keeping its own opt-outs (`DOLLY_NO_UPDATE_CHECK`, `NO_UPDATE_NOTIFIER`, quiet commands) and its stdout-only terminal test.

Changed:
- **`store.ts`** — `~/.dolly/projects/index.json` maps project realpath → store root. `locateStore()` checks `.dolly/` *and* the index at every level of the walk-up, so "nearest wins" holds across both mechanisms and a real `.dolly/` always beats an index entry for the same directory. New `kind: 'linked'`. `moveStore()` copies, verifies the task list arrived, then removes the source, and refuses a non-empty destination. `dollyHome()` honours `DOLLY_HOME`.
- **`cli.ts`** — `cmdInit` runs the wizard for a human; `setup` command; `--yes`; `--store local|global`; both added to `NO_AUTO` (no housekeeping mid-wizard) and `setup` to `WRITE_COMMANDS`.
- **`install.ts`** — module-level `const home = os.homedir()` became `home()`. See the trap below.

## Two decisions worth keeping

**Non-TTY behaviour is split, not uniform.** The user asked for "fail with a hint" rather than silent defaults. Applied narrowly: a *bare* `dolly init` with no terminal fails and names `--yes` plus the flags; an invocation that already carries any flag takes the old non-interactive path untouched. Flags are exactly the input the wizard would have collected, so failing there would be perverse — and it would break every existing script, Dockerfile and agent that already passes them. `install.test.mjs` passes unmodified, which is the guard on that.

**Nothing is written unless an answer changed it.** `changed(before, after)` compares the config with `user` stripped; the handle only reaches `local.json` when it differs from what `resolveIdentity` already returns. That is what makes enter-through byte-identical to the old `dolly init` (a test asserts the two `.dolly/` trees are equal) and a re-run a genuine no-op.

## Trap that cost real damage — read this before touching install tests

`install.ts` captured `const home = os.homedir()` at module load. A wizard test that picked "instruction scope: user config" therefore ran the *real* installer against the developer's actual `~/.claude` — it wrote a `dolly:instructions` block into `~/.claude/CLAUDE.md` and copied `skills/dolly`, `skills/dolly-planning`, `commands/dolly` into the real home. (Nikita chose to keep that install rather than have it reverted.)

Fixed on both sides:
1. `install.ts` resolves `home()` per call, so redirecting `HOME` works.
2. `tests/wizard.test.mjs:ground()` sets **both** `DOLLY_HOME` and `HOME` to a temp dir and restores them after. This also makes agent detection deterministic — before, `TARGETS.detect` saw whatever the developer had installed, so the same test behaved differently on different machines.

**Any test that exercises `installTargets` with `global: true` must redirect `HOME`.** There is no other guard.

## Testing shape

`tests/prompt.test.mjs` (16) drives a `scriptTerm` with a flat key list. `tests/wizard.test.mjs` (22) uses a `replyTerm` that answers by *matching the question text just drawn* — `[[/project brief/i, 'n']]` — because a flat keystroke list breaks whenever a prompt is added or conditionally skipped; unmatched questions get enter, which is how "enter-through" is expressed. `term.unanswered()` asserts every scripted question was actually asked, so a silently-skipped prompt fails the test instead of passing quietly.

Verified in a real pty (`script -q /dev/null`, with `CLAUDECODE`/`CI` unset) since unit tests bypass `stdioTerm` entirely: arrow keys, redraw, the raw→line mode switch for the handle prompt, `^C` → exit 130 with no store created, and the global-store path leaving `git status` clean.

## Known rough edges (not blockers)

- `line()` now drains keystrokes buffered by the previous raw prompt into the line, otherwise pasted or fast input looks like a hang. Only the single-byte, non-ctrl ones; an arrow key typed at a text prompt is dropped rather than echoed as an escape sequence.
- Text prompts print no `✓ answer` summary line, unlike select/confirm. Cosmetic asymmetry.
- The project-brief offer reappears on every `dolly setup` while the brief is missing. Deliberate, but it is a nag if someone declines it repeatedly.
- No migration was needed: the index lives outside every store and an absent index is indistinguishable from "no linked projects". `STORE_VERSION` stays 4.
- Windows raw-mode behaviour is unverified — the numbered fallback exists for it, and `TERM=dumb` exercises the same path on macOS.
<!-- /dolly:step 0001 -->

<!-- dolly:step 0003 -->
## 0003 · 2026-08-10T07:58:53Z · @nick-delirium

- task status: validating
- files: `README.md`, `skills/dolly/SKILL.md`, `src/cli.ts`, `src/core/render.ts`, `src/core/store.ts`, `src/core/tty.ts`, `src/core/update.ts`, `src/install.ts`, `src/mcp.ts`, `src/prompt.ts`, `src/templates/instructions.ts`, `src/wizard.ts`, `tests/prompt.test.mjs`, `tests/store-index.test.mjs`, `tests/wizard.test.mjs`

## The gap

Choosing an out-of-repo store worked, but only *dolly* reliably knew it had happened. Audit of the four places the fact could be read:

| channel | before | after |
|---|---|---|
| `dolly whoami` | correct — printed `(linked)` | unchanged |
| board header (`render.ts:51`) | branched on `kind === 'global'` only, so a **linked** store rendered like an ordinary one — the sole clue was an unusual path | `storeNote()` covers `linked`, `global` and `env` |
| SessionStart injection | printed the path, said nothing about where it was | states the store is NOT in the repo, that there is nothing to commit, and that no `.dolly/` exists here |
| the shipped agent instruction block | **flatly wrong**: "Task memory live in `.dolly/` (git-tracked, shared with teammates)" and "Commit `.dolly/` with your code" | states the usual case, names the exception, points at `dolly whoami` |
| the store's own `README.md` | "Commit this directory" — advice that cannot be followed | out-of-repo variant explains it is private, nothing to commit, and how to move it back |

The instruction block was the one that mattered. An agent reading it in a repo with a linked store would look for a directory that is not there, conclude dolly is not set up, or tell the user to commit a store they deliberately kept private — and the block is the highest-authority text the agent has.

## Notes

- `storeReadme()` decides in-repo-ness from `path.dirname(root) === project`, not from the `kind` passed into the `Store` constructor. `kind` is caller-supplied and the wizard was handing over a stale one; the path comparison cannot be wrong. (The wizard now passes the right kind anyway.)
- `skills/dolly/SKILL.md` carried the same commit rule and got the same exception. Note the installed copies in `~/.claude` and any project `CLAUDE.md` keep the old text until `dolly install` / `dolly setup` runs again — `setBlock` updates the marked block in place, so a re-run fixes them.
- Tests assert the full matrix in both directions: the linked store announces itself in board, whoami, hook and store README; the repo-local store says none of it and still says "Commit this directory". Both directions matter — the wrong-way assertion is what would have caught the original bug.
<!-- /dolly:step 0003 -->

<!-- dolly:step 0004 -->
## 0004 · 2026-08-10T08:11:09Z · @nick-delirium

- task status: validating
- files: `README.md`, `skills/dolly/SKILL.md`, `src/cli.ts`, `src/core/render.ts`, `src/core/store.ts`, `src/core/tty.ts`, `src/core/update.ts`, `src/install.ts`, `src/mcp.ts`, `src/prompt.ts`, `src/templates/instructions.ts`, `src/wizard.ts`, `tests/projects.test.mjs`, `tests/prompt.test.mjs`, `tests/store-index.test.mjs`, `tests/wizard.test.mjs`

## What was asked, and what was taken

Nikita proposed inverting resolution: check the global registry *first*, then local; entries carry `local: true|false`; if there is no entry but a local `.dolly/` exists, create one with `local: true`.

**Taken: the registry shape and the self-healing.** Entries are now `{path, local, store, created}` and both choices are recorded. That closes a real hole — "deliberately in the repo" and "dolly has never seen this project" were indistinguishable, and there was nowhere to answer "which projects does dolly know". `Store.init()` registers the project on the first write to any store, so a repo cloned from a teammate appears without anyone running setup.

**Declined: registry-first resolution.** Reasons, in order of weight:

1. **It is not actually first in the common case.** A teammate clones a repo with a committed `.dolly/` and has no entry, so registry-first falls through to the walk-up anyway. It would only ever be first in the rare case.
2. **It makes bookkeeping outrank ground truth.** A directory cannot be wrong about existing; an entry can be stale in every direction — store deleted, project moved, dotfiles half-synced onto a new machine, a `git clean` that took the store with it. Today a stale entry is *ignored* and everything still works. Registry-first turns each of those into a store that shadows a perfectly good `.dolly/`.
3. **When they disagree, the repo's store is the safer default.** It is the one the whole team can see, and preferring it is recoverable with `dolly setup`. Preferring the private one hides work a team is expecting to find.

The mirror failure is real though — go private, then pull a branch where a teammate committed `.dolly/`, and the store silently changes under you. So the disagreement is now *detected and reported* (`storeConflict`) rather than resolved in silence, which is the property registry-first was really reaching for.

## Where it landed

- `core/store.ts` — `ProjectEntry {path, local, store, created}`; `recordProject` (no-op when unchanged, `created` preserved across a change of mind), `forgetProject`, `projectEntry`, `storeConflict`. `readProjectIndex` normalises the first shape (`path → store` string) on read, so no migration and `STORE_VERSION` stays 4. `Store.inProject` decides in-repo-ness from `path.dirname(root) === project`, never from the caller-supplied `kind`.
- `Store.init()` self-registers, skipping `kind === 'env'` — a `DOLLY_DIR` store was pinned by the environment, not chosen, and recording it would outlive the variable.
- `cli.ts` — `dolly projects [--json] [--prune]`, the stderr conflict warning (never on stdout, hook JSON or MCP), `whoami` stating in-repo-ness plus the recorded entry.
- `render.ts` — `renderProjects`, and `storeNote` from the previous step.

## Traps worth knowing

- **A hand-built fake store makes the next command write.** `tests/projects.test.mjs` originally created `.dolly/tasks` + `config.json` by hand to fake a teammate's clone, then asserted `dolly board` writes nothing — it failed, because a store with no `.gitignore` triggers the *lossless* migration at `migrate.ts:226`, which calls `store.init()`, which registers the project. The code was right and the fixture was wrong. `seedClone()` now builds the store through the CLI under `DOLLY_DIR` (complete store, records nothing).
- **`dolly projects` opens other projects' stores read-only** by constructing `new Store({root, kind:'found', project})`. It is in `NO_AUTO`, so listing never triggers a migration or housekeeping in a store you merely looked at.
- **`~` shortening needs a realpath'd home.** Without it, any `HOME` that is a symlink or unnormalised (`/a/b/../c`) fails the prefix test and every row prints in full, which destroys the table.
- Reads never write the registry — asserted for `board`, `whoami` and `projects`. If a future read path starts writing, that test is the tripwire.
<!-- /dolly:step 0004 -->

<!-- dolly:step 0005 -->
## 0005 · 2026-08-10T08:23:30Z · @nick-delirium

- task status: validating
- files: `README.md`, `skills/dolly/SKILL.md`, `src/cli.ts`, `src/core/args.ts`, `src/core/render.ts`, `src/core/store.ts`, `src/core/tty.ts`, `src/core/update.ts`, `src/install.ts`, `src/mcp.ts`, `src/prompt.ts`, `src/templates/instructions.ts`, `src/wizard.ts`, `tests/args.test.mjs`, `tests/projects.test.mjs`, `tests/prompt.test.mjs`, `tests/store-index.test.mjs`, `tests/wizard.test.mjs`

Self-review of the wizard + registry work. Seven findings, all fixed, five with new tests. Two were real bugs a user would have hit.

## Fixed — behavioural bugs

**1. `--store` was silently dropped on the non-interactive path.** `dolly init --yes --store global` created a repo-local store. Reproduced, not theorised: the flag was only ever read into `WizardPre`, and `--yes` skips the wizard. This is the exact path scripts and CI take, and the flag is named in `dolly help` and in the no-terminal hint, so the one place it was documented was the one place it did nothing. `cmdInit` now resolves the target root itself. Moving an *existing* store stays interactive — relocating the only copy of someone's memory should not happen from a flag with no confirmation — so a `--store` that disagrees with an existing store fails and points at `dolly setup`.

**2. `--store globl` was silently ignored.** Any unrecognised value fell through to "no preference". Now `fail()`s naming the two valid values. Same class of bug as 1: a typo that looks like it worked.

**3. Store paths were built from an unresolved home.** `dollyHome()` returned `$DOLLY_HOME` / `os.homedir()` verbatim, so a home given as a symlink or an unnormalised path (`/a/b/../c`) produced a different *string* for the same physical directory. Same directory on disk, but the string lands inside recorded entries, in comparisons, and in the `~` shortening that keeps `dolly projects` readable — where a mismatch means every row prints in full. Now realpath'd, memoised on the raw env value (hot path: once per ancestor per lookup, and the env can still change inside a process — which it does in tests).

## Fixed — regression I introduced

**4. `locateStore()` re-read `index.json` once per ancestor directory.** Measured: 26 reads of the same file for one `dolly board` six levels deep (every ancestor × every `locateStore()` call a command makes; it was zero before this feature). The registry is now read once per lookup — 26 → 6. Not cached across lookups on purpose: the wizard writes the registry mid-process.

## Fixed — smaller, real

**5. `-y` did not mean `--yes`.** No alias, so `-y` parsed as a flag named `y`: on a terminal the wizard still opened, and off one the run counted as "flagged" and silently took defaults instead of being told what was missing. Aliased. An existing args test used `-xy val` with `y` as an arbitrary letter and had to move to `-xz`; the parser assertion is unchanged and `-y → yes` is now asserted too.

**6. Pasted or piped input lost every line after the first.** `line()` returned the text before the newline and discarded the rest of the chunk. Typing is unaffected (one line per chunk), but pasting `3⏎9⏎` into the two custom-housekeeping prompts dropped the `9`. A carry buffer keeps the remainder for the next prompt.

**7. "Nothing is committed" was false after moving a committed store out.** The working tree loses `.dolly/`, but git still tracks it, so the deletion is exactly the thing that has to be committed — and until it is, a teammate's pull restores the store and dolly starts reporting the store conflict. The wizard now checks `git ls-files -- .dolly` after a move and says `git rm -r --cached .dolly` instead.

## Also fixed while in there

- `opts.home` on the wizard was half-honoured: the explicit `recordProject` used it, while the one inside `Store.init()` used `dollyHome()`. Harmless only because the tests set `DOLLY_HOME` as well. Option removed — `DOLLY_HOME` is the single isolation knob.
- A dry run skipped the staging question instead of asking it and not acting.
- `optionLine` dimmed hints with `line.replace(hint, dim(hint))`, which dims the wrong span when the hint text also occurs in the label, and silently does nothing when the hint was clipped. Composed from parts now.

## Checked and deliberately left

- `readline.emitKeypressEvents` is idempotent (verified: three calls, zero extra `data` listeners), so `keysStart()` re-entering raw mode is safe.
- `moveStore` verifies only `tasks/`, not `archive/`. `cpSync` failing halfway while the task list still matches exactly is not a failure mode worth the extra code.
- `dolly projects --json --prune` prints prose, not JSON. `--prune` is an action, not a query.
- Text prompts print no `✓ answer` line, unlike select/confirm. Cosmetic asymmetry.
- Cancelling *after* the questions (at the project-brief offer) leaves the store and config written. The message says "nothing further written", which is accurate.
- `storeConflict` ignores entries recorded as `local` — a local entry disagreeing with a found `.dolly/` means the store moved inside the repo, which the walk-up already resolves correctly.
<!-- /dolly:step 0005 -->
