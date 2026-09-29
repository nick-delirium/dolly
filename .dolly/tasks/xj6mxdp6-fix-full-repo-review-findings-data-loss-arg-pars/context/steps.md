<!-- dolly steps · task xj6mxdp6 · append-only, newest at the bottom -->
# Full step context — Fix full-repo review findings: data loss, arg parsing, version gate, install safety, dead code

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001 -->
## 0001 · 2026-09-29T14:09:37Z · @nick-delirium

- task status: working
- files: `src/core/md.ts`, `src/core/task.ts`, `src/core/fsx.ts`, `src/core/store.ts`, `src/core/git.ts`, `src/core/related.ts`, `src/core/time.ts`, `src/core/update.ts`, `src/cli.ts`, `tests/integrity.test.mjs`, `tests/store-index.test.mjs`, `tests/globalshare.test.mjs`, `tests/update.test.mjs`

## Core integrity slice (md/task/fsx/store/git/related)

Root causes fixed:
- md.ts `scalar()` never unescaped what `emitScalar` escaped → backslashes doubled per save (16KB title after 12 steps). Now full escape set (\\ \" \n \r \t) both ways; `splitList` keeps quotes on items so `"null"` stays a string; list items containing `,[]` get quoted.
- `setSection` + `createTask` demote `## ` lines in user content to `###` (`demoteHeadings`). Sections end at the next `## `, so prose headings truncated specs and left orphan sections.
- Marker blocks: `blockRange` pairs the end marker AFTER the start. `setBlock` THROWS on an orphan start (old behaviour appended a 2nd block, then the next write deleted everything between). New `allBlocks` returns duplicates; `stepEntries` uses it so merged duplicate step ids are both readable.
- `renderSpecFile` neutralizes markers in body + history.
- `updateSpec`: all guards before any write; empty update throws; short/criteria-only edits now append a log line with reason.
- `addStep`: validates status + logs transition; n = max(counter, max block id)+1; >6 files with no detail still writes a steps.md entry (full file list survives for `related`); files normalized repo-relative via `normalizeFiles` (also applied in `relatedByFiles`).
- `retitle`: replacer fn (no `$&` expansion) + cleanTitle.
- fsx: `readJsonForUpdate` (missing/empty → fallback, unparseable → JsonFileError with `.jsonc` flag via `stripJsonc`); `readJson` stays tolerant for read-only use. `writeText` writes through symlinks.
- store: storeVersion/stampVersion/saveConfig/saveLocal/forgetProject strict; recordProject warns + skips on broken index. `resolve` tiers: exact title 6000; unique literal-tier winner (>=3500) resolves; fuzzy capped below 3500. projectEntry uses entryKeyIn (one precedence). Worktree→global store keeps `project` = worktree root.
- git: commonDir rejects echoed `--path-format` (git<2.31) and falls back to resolve+realpath; changedFiles uses -z and --full-name.
- Dead code removed: withFrontmatter, hasSection, specHistoryEntries, writeSpecHistory, monthBucket, currentBranch, headSha, git's isDir dup, linkedStore (tests now go through locateStore), upgradeCommand (+test), readText, cli writeJson import, housekeeping branch in related.classify.

Tests: tests/integrity.test.mjs (16). Suite was 222/222 before the new file.
Next: cli slice (per-command flag specs, op-based version gate, stdin only on `-`, multi-word refs, hook guard).
<!-- /dolly:step 0001 -->

<!-- dolly:step 0002 -->
## 0002 · 2026-09-29T14:15:52Z · @nick-delirium

- task status: working
- files: `src/core/args.ts`, `src/cli.ts`, `src/mcp.ts`, `src/migrate.ts`, `tests/cli-args.test.mjs`, `tests/mcp.test.mjs`, `tests/migrate.test.mjs`

## CLI + MCP + migrate slice

- args.ts: `parseArgs(argv, spec?, cmd)` with a per-command `FlagSpec` {bool, value}. Switches never take a value; value flags ALWAYS take the next token unless it is one of this command's own flags (then "--x needs a value"). Unknown flags → ArgError listing what the command takes. `-5` is positional. The old heuristic parser survives as `parseLoose` for spec-less callers (tests, unknown command words).
- cli.ts: `FLAGS` table + `ALIAS_OF`; `commandOf` finds the command word first (skipping leading --json/--help/--version) because switch-ness is per command (`--full` is a switch for show, text for spec).
- Version gate: `writesStore(cmd,args)` per operation (plan start/set/qa/finalize, project set/init, config set, reindex --apply, memo --save, migrate w/o --dry-run, hook stop). Reads on a newer store only warn.
- Hooks: dispatched before the gate inside try/catch — never error the host; newer store + stop → silent no-op.
- Stdin only on explicit `-` (any text flag). `pipedStdin` deleted.
- `refArg`: show/context/continue/related join all remaining words; empty → current.
- reindex digest resolves with store.resolve (no picker → no exit on ambiguity).
- continue: signal death → 128+signo, not 0. init --dry-run writes nothing ("would create").
- HELP rewritten: every alias/flag listed, refs described as 8-char ids + fuzzy, `board --all` dropped (still accepted, no-op).
- MCP: notifications never answered; non-object JSON → -32600; protocol negotiation over SUPPORTED set; `badArgs` validates required + types from each tool's inputSchema; per-call `writesStore` (project read / reindex digest allowed on newer store); risky migrations + .dollie orphan become a NOTE appended to results (CLI parity) instead of refusing writes; context gains `brief`, board gains `mine`/`tag`, reindex honours config includeThinking; REF text fixed; header comment lists what is CLI-only.
- migrate: `.dollie/` orphan moved out of migration v2 detect into `legacyOrphan()` warning (CLI guard + migrate + MCP); `header` flag on per-migration title actions so "N change(s) applied" counts real changes.

Tests: tests/cli-args.test.mjs (7), tests/mcp.test.mjs (6), migrate orphan test updated. Suite 257/257.
<!-- /dolly:step 0002 -->

<!-- dolly:step 0003 -->
## 0003 · 2026-09-29T14:21:07Z · @nick-delirium

- task status: working
- files: `src/install.ts`, `src/wizard.ts`, `src/prompt.ts`, `src/core/types.ts`, `src/cli.ts`, `commands/adopt.md`, `commands/checkpoint.md`, `commands/resume.md`, `commands/spec.md`, `commands/step.md`, `commands/validate.md`, `tests/install-safety.test.mjs`, `tests/install.test.mjs`

## Install / wizard / prompt slice

- All JSON merges go through `editJson` → `readJsonForUpdate`: unparseable (JSONC comments, trailing comma, truncated) files are SKIPPED with "Add X by hand", never replaced with `{dolly}` only. mergeMcpJson / zcode / opencode MERGE into an existing dolly entry (user `command` path + `env` kept; args normalized) and report up-to-date when unchanged.
- `syncTree` replaces copyTree for dolly-owned dirs (skills/dolly, skills/dolly-planning, commands/dolly): writes only changed files, PRUNES files no longer shipped, reports up-to-date. `installCommandFiles` does the same for `dolly-*.md` in shared command dirs (opencode/pi/zcode) — only the dolly- prefix is pruned, user commands untouched.
- `writeBlock` catches an orphan start marker (setBlock throws) and skips that file, rest of install continues.
- pi --global → `~/.pi/agent/AGENTS.md` (verified in pi README: SYSTEM.md REPLACES pi's whole system prompt).
- Scope honoured: codex global AGENTS.md at ~/.codex/AGENTS.md, codex MCP only with --global (local install no longer edits ~/.codex/config.toml); cursor global → mcp in ~/.cursor, rules skipped with note; windsurf global → ~/.codeium/windsurf/memories/global_rules.md (block); copilot/agents/zcode-workspace are project-only under --global (logged). Copilot detect = copilot-instructions.md or ~/.config/github-copilot, not any `.github/`.
- tomlBlock: existing `[mcp_servers.dolly]` outside markers → up-to-date (no duplicate table); end marker searched after start.
- Hooks: `hookCommand()` = `command -v dolly >/dev/null 2>&1 && dolly hook <x> || true` so teammates without dolly get silence; bare entries upgraded in place. cleanLegacy removes only `^(npx )?dollie hook` commands, per hook, not whole groups.
- `install.hooks` persisted in config (default true); wizard asks hooks for claude/opencode/zcode/pi, MCP for zcode/pi too; installOpts reads it. opencode plugin + pi extension now also gated by hooks.
- Commands: `${ARGUMENTS:-current}`/`${1:-current}` → `$ARGUMENTS`/`$1` (Claude Code only substitutes bare forms; CLI treats empty ref as current).
- prompt.ts: key() rejects with PromptCancelled on EOF (ended flag + 'end' listener) instead of hanging after Ctrl-D.

NOT done here (belongs to rqdpztdy autolog task): plugin+project double hooks detection, pi turnIndex `?? 0` dedup, opencode `seen` in memory.
Tests: tests/install-safety.test.mjs (11). Suite 262/262.
<!-- /dolly:step 0003 -->

<!-- dolly:step 0004 -->
## 0004 · 2026-09-29T14:25:50Z · @nick-delirium

- task status: working
- files: `src/core/home.ts`, `src/core/store.ts`, `src/core/identity.ts`, `src/core/update.ts`, `src/core/memo.ts`, `src/core/transcript.ts`, `src/core/md.ts`, `src/core/plan.ts`, `src/core/project.ts`, `src/reindex.ts`, `src/cli.ts`, `README.md`, `skills/dolly/SKILL.md`, `tests/integrity.test.mjs`

## Remaining medium/low findings + docs drift

- core/home.ts: `dollyHome()` moved out of store.ts (re-exported there). identity.json and update.json now live under dollyHome() (DOLLY_HOME isolates them); gh identity cache has a 7-day TTL, stale entry still used when gh is unreachable.
- memo: `isValidDate` rejects rolled-over dates (2026-02-31). eventsOn/filesTouchedToday now use related.parseLog — memo no longer re-reads task.md with its own two regexes.
- transcript: resubmitted prompts fold into the previous segment ONLY after an interrupt marker (in the prompt text, or a user/tool_result message carrying "[Request interrupted by user…]"). Suffix-named transcript dir fallback only when no exact dir exists AND exactly one candidate matches.
- Dead code: reindex's `export { listBlocks }`, NO_AUTO's unreachable help/version, double trim in hook stop --from-stdin. TBD regex unified as md.TBD_LINE (plan gate + project brief agree).
- Docs: SKILL.md (board --all, "task 0005", archive/ layout line, `--into 3`), README (pi SYSTEM.md → AGENTS.md, board --all, dolly archive, stdin/heredoc claim, full command reference incl. aliases/retitle/defaults/version/hook flags, ref resolution rules). Project brief Architecture/Conventions/Invariants updated.

Left for other tasks: plugin+project double hooks, pi turnIndex/opencode seen dedup, currentTask session preference, addStep lock (rqdpztdy); renderContext double filesOfTask + context bloat, checkpoint command, instructions slimming (3tx3c6t5).
Not done (feature, not a bug): `dolly uninstall`. Transcript relFile/classifyPath duplication left (different separator semantics, low value).
Suite 266/266, tsc clean incl. --noUnusedLocals.
<!-- /dolly:step 0004 -->
