<!-- dolly steps · task 0001 · append-only, newest at the bottom -->
# Full step context — Build Dollie agent tool for memory and task planning

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001 -->
## 0001 · 2026-08-07T08:50:48Z · @nick-delirium

- task status: working
- files: none
- source: session faa33f88-d19e-451a-8321-307f7d37483e · turn 18396703-9477-431f-b9c3-4d224f555824

## Request (verbatim, from the transcript)

I want to make a tool for llm agents, that should help with keeping long term memory and planning of features/tasks. Its named "dollie". Tool should allow claude code for example to save summary of each major step its done to the file (ie ~/.dollie/projects) where on top there will be description/spec of current feature, then summaries of each major step thats been done with timestamp, github user, summary of work and changed files. We add github user to be able to make this shared and saved inside project/github repo, so multiple users can co-work on a single feature or be updated of whats going on. There should be a housekeeping feature that removes old/outdated/done (configurable, also can be run automatic or manual). It should also save "full context" versions alongside with full description of task and each step, additional context etc. Whenever spec of task is changing, we add appendix full file but simply change spec in short "updates" file. Next, this tool should add a planning mode, like openspec, user should be able to start planning a task by describing it, then llm should ask questions to gather more details or obtain all conditions to know success criteria, risks, what should be changed, tested, etc, after that the "task" automatically creates updates and full spec file for first feature I wrote about (which should be able to work without planning stage), should be manageable as simple todo board with statuses: todo, planning, working, validating (on this stage agent gives results to human to check the work) and done. Check how openspec, codegraph, gref and caveman projects are done on github and implement this as a tool that you can install to claude (must have) or other coding agents (cover whatever is easy). All agent instructions should follow caveman mode whenever possible without losing precise instructions and context.

## Commands run

- `pwd; ls -la /Users/nikitamelnikov/Documents/proj/dollie 2>&1 | head -30; echo "---NODE---"; node -v; npm -v; echo "---PLUGINS---"; ls ~/.claude/plugins 2>/dev/n`
- `find ~/.claude/plugins/marketplaces -maxdepth 3 -type d 2>/dev/null | head -40; echo "===CAVEMAN==="; find ~/.claude/plugins -iname "*caveman*" -maxdepth 4 2>/d`
- `CM=~/.claude/plugins/marketplaces/caveman; ls -a $CM; echo "===claude-plugin==="; ls $CM/.claude-plugin; cat $CM/.claude-plugin/*.json 2>/dev/null | head -60; e`
- `CM=~/.claude/plugins/marketplaces/caveman; echo "===bin==="; ls $CM/bin; echo "===pkg==="; cat $CM/package.json; echo "===cmds==="; ls $CM/commands; echo "=== c`
- `CM=~/.claude/plugins/marketplaces/caveman; sed -n 1,60p $CM/skills/caveman/SKILL.md; echo "=====INSTALL.md====="; sed -n 1,80p $CM/INSTALL.md`
- `CM=~/.claude/plugins/marketplaces/caveman; echo "===lib==="; ls $CM/bin/lib; echo "===targets grep==="; grep -rhoE '"?(claude|codex|cursor|windsurf|gemini|copil`
- `which codegraph gref 2>&1; echo "---"; codegraph --help 2>&1 | head -40`

## Tools

Bash 7, ToolSearch 1, WebFetch 1, WebSearch 1

---

_Imported by `dollie reindex` from session faa33f88-d19e-451a-8321-307f7d37483e, turn 18396703-9477-431f-b9c3-4d224f555824 (2026-08-07T07:45:47.459Z → 2026-08-07T07:47:23.231Z). Mechanical import: the request is verbatim, the summary is not a human-written outcome. Correct it with a follow-up step if it misleads._
<!-- /dolly:step 0001 -->

<!-- dolly:step 0002 -->
## 0002 · 2026-08-07T08:50:48Z · @nick-delirium

- task status: working
- files: `package.json`, `tsconfig.json`, `.gitignore`, `LICENSE`, `src/core/types.ts`, `src/core/fsx.ts`, `src/core/md.ts`, `src/core/git.ts`, `src/core/identity.ts`, `src/core/store.ts`, `src/core/time.ts`, `src/core/task.ts`, `src/core/plan.ts`, `src/core/housekeep.ts`, `src/core/render.ts`, `src/core/args.ts`, `src/templates/instructions.ts`, `src/install.ts`, `src/cli.ts`, `src/mcp.ts`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `bin/dollie-hook.mjs`, `skills/dollie/SKILL.md`, `skills/dollie-planning/SKILL.md`, `commands/board.md`, `commands/resume.md`, `commands/step.md`, `commands/plan.md`, `commands/spec.md`, `commands/validate.md`, `commands/housekeep.md`, `README.md`, `tests/md.test.mjs`, `tests/helpers.mjs`, `tests/task.test.mjs`, `tests/plan.test.mjs`, `tests/housekeep.test.mjs`
- source: session faa33f88-d19e-451a-8321-307f7d37483e · turn 496c1b24-314e-4145-8400-02a03822db35

## Request (verbatim, from the transcript)

addition - its not gref its graft -> https://github.com/nanonets/graft

## Files touched

- `package.json`
- `tsconfig.json`
- `.gitignore`
- `LICENSE`
- `src/core/types.ts`
- `src/core/fsx.ts`
- `src/core/md.ts`
- `src/core/git.ts`
- `src/core/identity.ts`
- `src/core/store.ts`
- `src/core/time.ts`
- `src/core/task.ts`
- `src/core/plan.ts`
- `src/core/housekeep.ts`
- `src/core/render.ts`
- `src/core/args.ts`
- `src/templates/instructions.ts`
- `src/install.ts`
- `src/cli.ts`
- `src/mcp.ts`
- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `bin/dollie-hook.mjs`
- `skills/dollie/SKILL.md`
- `skills/dollie-planning/SKILL.md`
- `commands/board.md`
- `commands/resume.md`
- `commands/step.md`
- `commands/plan.md`
- `commands/spec.md`
- `commands/validate.md`
- `commands/housekeep.md`
- `README.md`
- `tests/md.test.mjs`
- `tests/helpers.mjs`
- `tests/task.test.mjs`
- `tests/plan.test.mjs`
- `tests/housekeep.test.mjs`

## Commands run

- `npm install --silent 2>&1 | tail -5 && npx tsc -p tsconfig.json 2>&1 | head -40`
- `npx tsc -p tsconfig.json 2>&1 | head -40 && echo "TSC OK" && node -e "require('fs').chmodSync('dist/cli.js',0o755)" && node dist/cli.js --version && node dist/c`
- `set -e`
- `npx tsc -p tsconfig.json 2>&1|head -5`
- `SB=/private/tmp/claude-501/-Users-nikitamelnikov-Documents-proj-dollie/faa33f88-d19e-451a-8321-307f7d37483e/scratchpad/sandbox`
- `npm test 2>&1 | tail -50`
- `npm test 2>&1 | tail -30`
- `npx tsc -p tsconfig.json 2>&1 | head -20`
- `npx tsc -p tsconfig.json --noEmit --noUnusedLocals --noUnusedParameters 2>&1 | head -20`
- `cd /Users/nikitamelnikov/Documents/proj/dollie`

## Tools

Write 38, Bash 19, Edit 12, WebFetch 1

## Assistant closing message

Built. `/Users/nikitamelnikov/Documents/proj/dollie` — 3.3k lines TS, zero runtime deps, 26/26 tests pass.

## What it does

**Store** — repo-local `.dollie/` (git-tracked, shared) by default. `~/.dollie/projects/<name>-<hash>` only when not in a repo. Resolution order: `DOLLIE_DIR` → nearest `.dollie/` → repo root → global.

```
.dollie/tasks/0001-oauth-login/
  task.md                     # frontmatter + short spec + criteria + step log  ← shared file
  context/
    spec.md                   # current full spec
    spec.v1.md spec.v2.md     # appendix per spec change, append-only
    plan.md                   # interview record
    steps/0001.md 0002.md     # full context per step
.dollie/archive/2026-08/…
```

**Two-tier steps** — `-m` short summary → `task.md`; `--detail-file` → `context/steps/NNNN.md`. Each stamped timestamp + GitHub handle (`gh api user` → git noreply email → `$USER`, cached, `DOLLIE_USER` overrides) + changed files (`--auto-files` reads git). `collaborators` frontmatter accumulates.

**Spec change** — `dollie spec <ref> --short … --file … --reason …` bumps version, snapshots full spec to `spec.vN.md`, replaces only short summary. `--short` alone = no bump.

**Board** — `todo → planning → working → validating → done`. Agents told to stop at `validating`; `done` is human's call. `current`/`@` ref = most recent working, else validating, else planning.

**Planning mode** — gated, not advisory:
```
plan start → plan check (agenda, exit 1) → ask user → plan qa / plan set → plan check → plan finalize
```
`plan check` fails while any of 8 sections is blank/`_TBD_` or an Open Question unchecked. `finalize` derives full spec + criteria + Decisions-from-Q&A, writes appendix, status → `todo`. `--force` overrides. Plain `dollie new` skips planning entirely.

**Housekeeping** — auto once/day on write (throttled by gitignored `.housekeep.json`), or manual with `--dry-run`. Archives old `done` → `archive/YYYY-MM/`, flags stale, prunes old full step files while keeping every summary (dead links rewritten to `_pruned by housekeeping_`), optional archive deletion. All 7 knobs in `config.json`, `dollie config set housekeep.X Y`.

## Install surface

| Target | Wiring |
|---|---|
| **Claude Code plugin** | `.claude-plugin/plugin.json` — 2 skills, 7 slash commands, MCP server, SessionStart hook (injects active task spec every session), Stop hook (non-blocking nudge via `systemMessage`) |
| Claude Code files | `dollie install claude` → `.claude/skills/`, `.claude/commands/dollie/`, `CLAUDE.md` block, `.mcp.json` |
| Codex / Cursor / Windsurf / Copilot / Gemini / opencode / generic | rules file or `AGENTS.md` block + MCP entry where supported |

`dollie init` auto-detects and wires all present agents. Idempotent (`&lt;!-- dollie:instructions -->` markers), `--dry-run`, `--global`, `--no-mcp`. Verified: install → re-run → `up-to-date`.

`dollie mcp` — hand-rolled line-delimited JSON-RPC, 14 tools, full CLI parity. Verified against a real handshake.

All agent-facing text (skills, commands, instruction blocks) written in caveman register — commands, paths, flags, gates verbatim.

## Two caveats

1. Not a git repo, not published. `README.md` install lines (`npm install -g dollie`, `claude plugin marketplace add nikitamelnikov/dollie`) are forward-looking — they need `git init` + push + `npm publish` to work.
2. Verified locally by running the built CLI directly (`node dist/cli.js`). I did not run `dollie init` on this project itself, since with no git repo the store would land in your home dir — say the word and I'll `git init` + dogfood it.

Prior art followed: openspec (gate + archive-by-date), graft (git-tracked context, multi-agent install), codegraph (CLI/MCP parity), caveman (plugin layout + register).

---

_Imported by `dollie reindex` from session faa33f88-d19e-451a-8321-307f7d37483e, turn 496c1b24-314e-4145-8400-02a03822db35 (2026-08-07T07:48:31.830Z → 2026-08-07T08:10:58.601Z). Mechanical import: the request is verbatim, the summary is not a human-written outcome. Correct it with a follow-up step if it misleads._
<!-- /dolly:step 0002 -->

<!-- dolly:step 0003 -->
## 0003 · 2026-08-07T08:50:48Z · @nick-delirium

- task status: working
- files: `src/core/types.ts`, `src/core/store.ts`, `src/core/md.ts`, `src/core/task.ts`, `src/core/housekeep.ts`, `src/core/render.ts`, `src/cli.ts`, `tests/plan.test.mjs`, `tests/install.test.mjs`, `src/templates/instructions.ts`
- source: session faa33f88-d19e-451a-8321-307f7d37483e · turn 8434189b-8891-4597-b521-efb6c4c883fe

## Request (verbatim, from the transcript)

make global and local installment a setting, change it to local by default. Also few questions, followups: change mentions of me to "nick-delirium" (my github username), shouldn't steps be a single file? with layout like spec/ctx at the top, then couple linebreaks, [timestam]-[username]: [update]? this makes it a bit easier to follow. Also appendix to changing feature scope can be in same file as spec itself, this way we will have less files created and its easier for human to inspect, maybe easier to work with for llm as well? I might be wrong here ofc

## Files touched

- `src/core/types.ts`
- `src/core/store.ts`
- `src/core/md.ts`
- `src/core/task.ts`
- `src/core/housekeep.ts`
- `src/core/render.ts`
- `src/cli.ts`
- `tests/plan.test.mjs`
- `tests/install.test.mjs`
- `src/templates/instructions.ts`

## Commands run

- `npx tsc -p tsconfig.json --noEmit --noUnusedLocals --noUnusedParameters 2>&1 | head -20`
- `cd /Users/nikitamelnikov/Documents/proj/dollie`
- `npx tsc -p tsconfig.json 2>&1 | head -10 && echo BUILD_OK`
- `SB=/private/tmp/claude-501/-Users-nikitamelnikov-Documents-proj-dollie/faa33f88-d19e-451a-8321-307f7d37483e/scratchpad/v2`
- `npm test 2>&1 | tail -20`
- `set -e`
- `npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)" && grep -n "steps.md\|Superseded" src/templates/instructions.ts`

## Tools

Edit 20, Bash 14, Write 3

## Assistant closing message

Done. 33/33 pass, typecheck clean, no stale references.

## 1. Install scope is now a setting, local by default

```json
"install": { "scope": "local", "mcp": true }
```

```bash
dollie config set install.scope global   # persist
dollie install claude --local            # or override one run
dollie init                              # prints: agent instructions: local
```

`--local` / `--global` flags win over config; `install.mcp` controls MCP registration (`--no-mcp`/`--mcp` override). Local writes into the project (`.claude/`, `CLAUDE.md`, `.mcp.json`) so instructions ship in the repo with `.dollie/`.

## 2. `nick-delirium` everywhere

`package.json`, `LICENSE`, `plugin.json`, `marketplace.json`, README examples, marketplace path.

## 3. Steps in one file — yes, you were right

`context/steps/0001.md … 0040.md` → one `context/steps.md`, append-only, entries delimited by `&lt;!-- dollie:step 0003 -->` markers so housekeeping can still prune individually.

And the short log in `task.md` is now flat, one line per event, exactly the shape you described:

```markdown
## Log

- `2026-08-07 08:29Z` @nick-delirium: status todo → working.
- `2026-08-07 08:29Z` @nick-delirium: Wired GitHub OAuth callback route.
  files: `src/auth/callback.ts` · full: `steps.md#0001`
- `2026-08-07 08:29Z` @nick-delirium: spec → v2. security review demanded PKCE
  previous version kept in `spec.md`
- `2026-08-07 08:29Z` @nick-delirium: Added PKCE verifier + S256 challenge.
  files: `src/auth/pkce.ts` · full: `steps.md#0003`
```

Steps, spec bumps and status moves all land in the same stream — one chronological read instead of three interleaved formats. Dropped the `### 0001 ·` headings; they added nesting without information.

## 4. Spec history inside spec.md — also right, and better for the LLM

```markdown
**current: v2** · updated 2026-08-07T08:29:13Z by @nick-delirium · superseded versions are kept at the bottom of this file

<current spec>

## Superseded versions

## v1 — 2026-08-07T08:29:12Z · @nick-delirium

> superseded by v2: security review demanded PKCE

<v1 spec, verbatim>
```

Why it's better, not just fewer files: one `Read` gets current spec *plus* the reason it changed *plus* what it replaced. Before, the agent had to glob `spec.v*.md`, sort numerically, and diff to figure out what moved. Newest superseded version sits directly under the current one, so `head -60 spec.md` answers "what changed and why".

Per task: **3 files** (`task.md`, `context/spec.md`, `context/steps.md`) + `plan.md` only when planned. A task's whole history is two diffs in a PR.

## Verified

Prune still works on the merged files — `keepFullStepsPerTask: 1` dropped step 0001's block from `steps.md`, left 0003 intact, rewrote the dangling link to `full: _pruned by housekeeping_`, and kept every one-line summary. `keepSpecVersions` trims oldest entries from the history section. Both covered by tests, plus new tests for scope config, `--local` override, and dotted `config set/get`.

One implementation note: `stepEntries()` falls back to reading the old `context/steps/NNNN.md` layout if `steps.md` is absent, so any store you already created keeps working — but nothing writes the old layout anymore.

---

_Imported by `dollie reindex` from session faa33f88-d19e-451a-8321-307f7d37483e, turn 8434189b-8891-4597-b521-efb6c4c883fe (2026-08-07T08:19:38.666Z → 2026-08-07T08:29:53.917Z). Mechanical import: the request is verbatim, the summary is not a human-written outcome. Correct it with a follow-up step if it misleads._
<!-- /dolly:step 0003 -->

<!-- dolly:step 0004 -->
## 0004 · 2026-08-07T08:50:48Z · @nick-delirium

- task status: working
- files: `src/core/transcript.ts`, `src/core/task.ts`, `src/reindex.ts`, `src/migrate.ts`, `src/cli.ts`, `src/core/store.ts`, `src/core/md.ts`, `tests/reindex.test.mjs`, `tests/migrate.test.mjs`, `src/mcp.ts`, `commands/adopt.md`
- source: session faa33f88-d19e-451a-8321-307f7d37483e · turn 9bdaa345-50b6-4843-8d76-216af36768c2

## Request (verbatim, from the transcript)

can we also add an option to reindex current conversation to attach dollie to ongoing dialogues in claude code? this can also be used when we update versions and change for example how indexing works as well, which is what I want to test here - we will install it and test on this convo.

## Files touched

- `src/core/transcript.ts`
- `src/core/task.ts`
- `src/reindex.ts`
- `src/migrate.ts`
- `src/cli.ts`
- `src/core/store.ts`
- `src/core/md.ts`
- `tests/reindex.test.mjs`
- `tests/migrate.test.mjs`
- `src/mcp.ts`
- `commands/adopt.md`

## Commands run

- `P=~/.claude/projects/-Users-nikitamelnikov-Documents-proj-dollie`
- `node -e "`
- `cd /Users/nikitamelnikov/Documents/proj/dollie`

## Tools

Bash 26, Edit 19, Write 6

## Assistant closing message

All 41 pass. The store now carries my rebuild noise — resetting it so what you inspect is what a real user gets:

---

_Imported by `dollie reindex` from session faa33f88-d19e-451a-8321-307f7d37483e, turn 9bdaa345-50b6-4843-8d76-216af36768c2 (2026-08-07T08:34:56.536Z → 2026-08-07T08:50:42.278Z). Mechanical import: the request is verbatim, the summary is not a human-written outcome. Correct it with a follow-up step if it misleads._
<!-- /dolly:step 0004 -->

<!-- dolly:step 0005 -->
## 0005 · 2026-08-07T08:51:02Z · @nick-delirium

- task status: working
- files: none

## What landed

`dollie reindex` — adopt a conversation already in flight — plus `dollie migrate` for store-format upgrades.

## Design decision: two phases, not one

The CLI extracts only mechanical facts from the transcript; the agent writes the prose. Reason: the agent already has the conversation in context, so it is a strictly better summarizer than any transcript parser. What it does NOT reliably have is turn boundaries, real timestamps, and the exact file list — especially after a compaction. So the split is: transcript supplies facts, agent supplies meaning. `--apply` still does a mechanical import so nothing is lost if the agent stops early, and the imported spec announces that it is mechanical.

## Transcript format (undocumented, verified empirically)

`~/.claude/projects/<cwd with non-alphanumerics → dashes>/<session-id>.jsonl`, one JSON object per line.

- real human turn: `type: "user"` && `origin.kind === "human"` && content is not a `tool_result` array
- `type: "ai-title"` carries a usable task title (`aiTitle`)
- assistant content blocks: `thinking` | `text` | `tool_use`; files come from `tool_use.input.file_path` on Write/Edit/MultiEdit/NotebookEdit, commands from Bash `input.command`
- `isSidechain: true` marks subagent turns — counted, never treated as project work
- prompts carry injected `<system-reminder>` blocks and `UserPromptSubmit hook additional context:` lines — stripped
- an interrupted-then-resubmitted prompt appears twice; deduped by prefix match

Excluded from imports by design: thinking blocks (private reasoning), tool results (noise), subagent file writes, paths outside the project, `.dollie/**`.

## Idempotency

Each imported step records `- source: session <id> · turn <uuid>` in its steps.md entry. `importedTurns()` greps those and skips them, so re-running is a no-op. `--rebuild` removes this session's blocks and re-imports — that is the path for "the format changed, re-derive".

## Three bugs found by dogfooding, not by tests

1. **`~/.dollie` shadowed every project store.** The identity cache created `~/.dollie/identity.json`, and `locateStore`'s walk-up treated any `.dollie/` dir as a store — so every project under `$HOME` resolved to `~/.dollie` with `project = $HOME`. Fixed: a store must contain `config.json` or `tasks/`, and dollie's own home is excluded unconditionally. This would have hit every user on first run.
2. **38-file dump in the short log.** `addStep` inlined the entire file list, destroying the skimmability the log exists for. Capped at 6 + `+N more`; complete list stays in steps.md.
3. **Marker injection.** Imported content containing `&lt;!-- /dollie:step 0003 -->` would terminate its enclosing block early and silently truncate everything after. Real, and triggered by my own assistant message quoting dollie's markers. Fixed with `neutralizeMarkers()` on all block writes (`<!--` → `&lt;!--` only before `dollie:`), applied in `setBlock` and `appendBlock`. Covered by a hostile-content test.

Two smaller fragilities the tests then caught: `importedTurns` assumed 36-char uuids (now any non-separator token), and `migrate` trusted a parsed spec version over the frontmatter (the pre-0.2 `spec.md` had no version marker, so all history was dropped).

## Ordering semantics for clarification turns

A turn that ran no tools is a clarification: it folds into the work that follows it. A trailing one has no work yet, so it stays its own segment — it is a pending request, not noise. `--all-turns` disables folding.

## Next

- `dollie migrate` has no real-world exercise; only the synthetic downgrade fixture covers it. First actual version bump will be the real test.
- The transcript reader is the only part coupled to an undocumented format. If it breaks, `--file` plus `--all-turns` is the escape hatch.
- Not published: no git repo, no npm publish. `npm link` is what is installed right now.
<!-- /dolly:step 0005 -->

<!-- dolly:step 0007 -->
## 0007 · 2026-08-07T09:06:56Z · @nick-delirium

- task status: working
- files: none

## Outcome

Logs now record what the agent concluded, not what it was asked. Tasks remember their conversations and can reopen them. Logging is automatic via the Stop hook.

## Summary derivation (the core change)

A step summary is taken, in priority order, from:
1. the **last substantial** assistant message (>= 40 chars of prose) — that is the agent's own wrap-up
2. the last message of any length
3. a synthesis from the work chain (`No written summary. changed 2 file(s): a.ts, b.ts; ran 1 command(s).`)
4. the request, prefixed `asked to:` — last resort only

"Last substantial" rather than plain "last" matters: a trailing one-liner like "Now testing this:" is a lead-in, not a summary. Caught by reading the digest of this very session.

Step detail is ordered agent-account-first: `What the agent said it did` → `Work chain` → `Files touched` → `Commands run` → `Request that opened the turn` (verbatim, demoted). An assertion enforces the ordering so nobody silently flips it back.

## Work chain

New per-segment ordered trace of what actually ran, with consecutive repeats collapsed (`Edit src/cli.ts ×2`). Two filters, both found by dogfooding:

- **Path filter.** `Write (outside the project)` for scratch paths; writes to `.dollie/` are dropped entirely as circular bookkeeping. The strict `files` list already excluded these, but the chain's display path used a basename fallback and leaked `scratch.md`.
- **Shell filter.** `meaningfulCommand()` skips `cd`/`set`/`export`/`source` lines, because scripts routinely open with navigation. Before it, half the chain read `Bash: cd /Users/...` — useless.

## Thinking blocks: opt-in, and why

`reindex.includeThinking` / `--include-thinking`, default **off**. Reasoning is verbose, frequently contradicted later in the same turn, and the conclusions that survive already appear in the visible messages and the work chain. What it genuinely buys is rationale that never made it into a reply — real but low density per token. Captured into a labelled `## Reasoning (raw, opt-in)` section that states it is tentative.

## Session tracking

`CLAUDE_CODE_SESSION_ID` is exported inside Claude Code and is exactly the transcript's basename — verified against this session. So no parsing is needed to self-identify. `touch()` appends it to `TaskMeta.sessions`, meaning any step/status/spec change records the conversation. `DOLLIE_SESSION_ID` overrides for other agents.

`dollie continue <ref>` runs `claude --resume <latest session>`. It **prints instead of execs** when `CLAUDECODE=1` or stdout is not a TTY — spawning an interactive TUI out of a tool call would hang. `--fork` maps to `--fork-session`, `--print` forces printing.

Tests had to be made hermetic: they were inheriting the live `CLAUDE_CODE_SESSION_ID` and recording it on fixture tasks. `sandbox()` now deletes it.

## Auto-logging

Stop hook → tail reindex of the current session into the active task. The duplicate problem (agent logs a good step, hook then imports the same turn mechanically) is solved with `onlyNewerThan`: segments starting before the task's last-updated time are skipped, so any turn the agent engaged with dollie during is left alone. Plus the existing turn-uuid dedupe as a second line of defence.

Gated on `reindex.autoLog` and `autoLogOnlyWhenWorking`. Wrapped in try/catch — a missing or half-flushed transcript must never break a session, so it silently falls through to the old nudge.

Known limitation: at Stop time the final assistant message may not be flushed yet, so an auto-entry can carry a weaker summary than the same turn logged manually. Another reason the instructions tell the agent to log its own steps.

## Tiered reading — the answer to "short chain or full context?"

Neither alone. `dollie context <ref>` is now the default answer and returns spec + criteria + whole one-line log + last **3** (was 5) steps in full. Added `--brief` for spec+log only. `-n 0` for everything, described as archaeology.

Rationale: the short log says *what* happened, full step context says *why*, and you need why before changing code. Reading every step in full is waste because older steps were superseded. Session-start injection now also carries the last 6 log lines and explicitly labels itself an index, not the record, pointing at `dollie context`.

## Install

`dollie install claude` now registers SessionStart + Stop hooks in `.claude/settings.json`, deduped by command substring, so auto-logging works without the plugin. `--no-hooks` opts out.

## Next

- Auto-log has not run in anger yet — it fires on the next Stop after this step. Watch whether one-step-per-turn is the right granularity or whether it should require a file change.
- `proseOf()` strips markdown crudely (drops any line starting with `#>|-*+` or a digit). Fine for summaries; would be wrong if reused for anything needing fidelity.
<!-- /dolly:step 0007 -->

<!-- dolly:step 0008 -->
## 0008 · 2026-08-07T09:13:02Z · @nick-delirium

- task status: working
- files: none

## About to do

Rename the whole project dollie -> dolly. Logging BEFORE the refactor so there is rollback context if it goes wrong mid-way.

## Confirmed working automatically (this session, no manual action)

The wiring from last turn is live and verified by observation, not assertion:
- SessionStart hook fired and injected the active task index (spec, criteria, last 6 events, tiered-read guidance, `dollie continue` hint)
- MCP server loaded — 15 `dollie_*` tools registered as deferred tools
- Skills registered: `dollie`, `dollie-planning`, plus 9 `/dollie:*` slash commands from `.claude/commands/dollie/`

So `dollie install claude` + `.claude/settings.json` hooks work end to end without the plugin.

## Rename surface (everything that must move)

1. package name + bin `dollie` -> `dolly`
2. store directory `.dollie/` -> `.dolly/` — EXISTING STORES MUST MIGRATE, this repo has one with 7 steps
3. env vars `DOLLIE_DIR|USER|SESSION_ID|TRANSCRIPT_DIR` -> `DOLLY_*`
4. markdown block markers: `&lt;!-- dollie:header -->`, `dollie:instructions`, `dollie:step NNNN`, `dollie:spec-current`, `dollie:spec-history` -> `dolly:` — these are PARSED, so a rename without migration silently orphans every existing block
5. skills dirs `skills/dollie{,-planning}` -> `skills/dolly{,-planning}`, `bin/dollie-hook.mjs`
6. MCP server name + all 15 tool names `dollie_*` -> `dolly_*`
7. plugin.json / marketplace.json names, README, tests, agent instruction blocks
8. installed artifacts in this repo: `.claude/skills/dollie*`, `.claude/commands/dollie/`, `.mcp.json` server key, `.claude/settings.json` hook commands, `CLAUDE.md` block

## Decisions taken up front

- **Do NOT rename the project directory.** `/Users/.../proj/dollie` is the cwd of this live session and the key Claude Code uses to locate the transcript (`-Users-nikitamelnikov-Documents-proj-dollie`). Renaming it mid-session would orphan the transcript and break reindex. Cosmetic anyway.
- **Ship `dollie` as a deprecated bin alias** alongside `dolly` for one version. Without it, unlinking mid-session kills the already-registered MCP server and the `dollie hook stop` command in settings.json.
- **Legacy env vars stay readable** as a fallback (`DOLLY_DIR` first, then `DOLLIE_DIR`). One line each, avoids a cliff.
- **Extend `dolly migrate`** to handle the store rename: `.dollie/` -> `.dolly/` plus rewriting `dollie:` markers to `dolly:` inside task.md / steps.md / spec.md. This is the real test of the migration path the user asked for.

## Risk

The marker rename is the dangerous part. `getBlock`/`listBlocks`/`removeBlock` all match on the literal `dollie:` prefix. Rename the code without rewriting existing files and every step entry becomes invisible — `stepEntries()` returns [] and the step log silently loses all full context. Migration must rewrite files, and a test must prove a v0.2 `.dollie/` store survives the upgrade with all steps intact.
<!-- /dolly:step 0008 -->

<!-- dolly:step 0009 -->
## 0009 · 2026-08-07T09:19:02Z · @nick-delirium

- task status: working
- files: `.claude-plugin/marketplace.json`, `.claude-plugin/plugin.json`, `.claude/commands/dolly/adopt.md`, `.claude/commands/dolly/board.md`, `.claude/commands/dolly/housekeep.md`, `.claude/commands/dolly/plan.md`, `.claude/commands/dolly/resume.md`, `.claude/commands/dolly/spec.md`, `.claude/commands/dolly/step.md`, `.claude/commands/dolly/update.md`, `.claude/commands/dolly/validate.md`, `.claude/settings.json`, `.claude/skills/dolly-planning/SKILL.md`, `.claude/skills/dolly/SKILL.md`, `.gitignore`, `.mcp.json`, `CLAUDE.md`, `LICENSE`, `README.md`, `bin/dolly-hook.mjs`, `commands/adopt.md`, `commands/board.md`, `commands/housekeep.md`, `commands/plan.md`, `commands/resume.md`, `commands/spec.md`, `commands/step.md`, `commands/update.md`, `commands/validate.md`, `package-lock.json`, `package.json`, `skills/dolly-planning/SKILL.md`, `skills/dolly/SKILL.md`, `src/cli.ts`, `src/core/args.ts`, `src/core/fsx.ts`, `src/core/git.ts`, `src/core/housekeep.ts`, `src/core/identity.ts`, `src/core/md.ts`, `src/core/plan.ts`, `src/core/render.ts`, `src/core/session.ts`, `src/core/store.ts`, `src/core/task.ts`, `src/core/time.ts`, `src/core/transcript.ts`, `src/core/types.ts`, `src/install.ts`, `src/mcp.ts`, `src/migrate.ts`, `src/reindex.ts`, `src/templates/instructions.ts`, `tests/helpers.mjs`, `tests/hooks.test.mjs`, `tests/housekeep.test.mjs`, `tests/install.test.mjs`, `tests/md.test.mjs`, `tests/migrate.test.mjs`, `tests/plan.test.mjs`, `tests/reindex.test.mjs`, `tests/task.test.mjs`, `tsconfig.json`

## Outcome

Project renamed dollie -> dolly, 832 occurrences across 45 files, with a working upgrade path for anyone who already had a store installed. 55 tests pass.

## The dangerous part, and why

The block markers (`<!-- dolly:header -->`, `<!-- dolly:step 0001 -->`, `<!-- dolly:spec-current -->`) are **parsed**, not decorative — `getBlock`, `listBlocks` and `removeBlock` all match the literal prefix. Renaming the code without rewriting existing files would have left every step entry and spec block invisible: `task.md` would still list 8 steps while `stepEntries()` returned `[]` and all full context silently vanished. No error, no crash, just quiet data loss.

So `dolly migrate` grew three responsibilities beyond the old task-layout merge:
1. move `.dollie/` -> `.dolly/`
2. rewrite `<!--[/]dollie:` -> `<!--[/]dolly:` in task.md, spec.md, steps.md, plan.md
3. regenerate the store README

Verified on this repo's real store: 8 steps, 7 step blocks, spec v2 with history — all readable after the move, 0 stale markers.

**Prose is deliberately NOT rewritten.** Step notes that mention "dollie" are a record of what someone actually wrote; rewriting them would falsify history. Only markers and generated text move. A test asserts prose survives verbatim.

## Compatibility decisions

- **`dollie` ships as a second bin** pointing at the same CLI. Without it, `npm link` mid-session would have killed the already-registered MCP server and the `dollie hook stop` command in `.claude/settings.json`. A rename that breaks running agents is not a rename anyone can adopt.
- **Legacy env vars still read**: `DOLLY_DIR` then `DOLLIE_DIR`, same for `_USER`, `_SESSION_ID`, `_TRANSCRIPT_DIR`. One `||` each.
- **`locateStore` still finds `.dollie/`** and flags it `legacy`, so an un-migrated store is never reported as missing. Every command warns once on stderr with the fix.
- **Project directory NOT renamed.** `/Users/.../proj/dollie` is this session's cwd and the key Claude Code derives the transcript path from (`-Users-...-proj-dollie`). Renaming it mid-session orphans the transcript and breaks reindex. Cosmetic only.

## `install` now cleans its own old footprint

An upgrade previously left a working install *and* a dead one: two skill dirs, two command sets, two MCP servers, two hook entries, and a stale instruction block that `setBlock` could not update because its marker no longer matched — so it appended a second block below the first. `cleanLegacy()` removes `.claude/skills/dollie*`, `.claude/commands/dollie/`, `mcpServers.dollie` from four possible config files, `dollie` hook entries, and renames stale instruction-block markers so the block updates in place. Idempotent.

## Two bugs found while doing it

1. **Stateful regex.** `LEGACY_MARKER` is global, and `.test()` on a global regex advances `lastIndex` — so filtering a list of files with it would have skipped every other file, migrating some and silently leaving others broken. Split into a non-global `HAS_LEGACY_MARKER` for testing.
2. **Orphaned store ignored.** When both `.dolly/` and `.dollie/` exist, `locateStore` prefers `.dolly/` and the old one would have sat there unnoticed holding real history. `migrate` now reports it as an action requiring a manual merge rather than guessing or ignoring.

## Gap the rename exposed: no way to retitle

The task was called "Build Dollie agent tool..." and nothing could change that — title lives in frontmatter and in the directory slug, and the tool's own rule forbids hand-editing `.dolly/**`. Added `dolly retitle <ref> "<title>"`: updates frontmatter, the H1, logs the change, and moves the directory so the slug follows the title. The id stays the stable handle, so no reference breaks.

## What could not be verified in-session

MCP tool names change `dollie_*` -> `dolly_*`, but the MCP server list is bound at session start — this session still holds the old `mcp__dollie__*` tools, which keep working through the bin alias. The `dolly` server appears next session. `.claude/settings.local.json` still lists `"dollie"` in `enabledMcpjsonServers`; harmless, since that server no longer exists in `.mcp.json` and `enableAllProjectMcpServers: true` covers `dolly`. Left alone because it is a user permission file.

Skills and slash commands DID reload live — `dolly`, `dolly-planning` and 9 `/dolly:*` commands registered mid-session, old ones gone.

## Next

- Drop the `dollie` bin alias and the legacy env fallbacks before 1.0; they exist only to make this one rename survivable.
- `.dollie` legacy discovery in `locateStore` is the other thing to delete then.
<!-- /dolly:step 0009 -->

<!-- dolly:step 0010 -->
## 0010 · 2026-08-07T09:21:01Z · @nick-delirium

- task status: working
- files: `src/migrate.ts`, `tests/migrate.test.mjs`

## Correcting step 0009

Step 0009's notes claim marker migration leaves prose alone. When it was written that was the intent, not the behaviour. The bug then demonstrated itself on that very step.

## What happened

`rewriteMarkers()` used an unanchored regex, `/<!--(\s*\/?\s*)dollie(:|\s)/g`. Step 0009's own notes discuss the old markers inline:

> The block markers (`<!-- dollie:header -->`, `<!-- dollie:step 0001 -->`, `<!-- dollie:spec-current -->`) are **parsed**, not decorative

The next `dolly migrate` run rewrote those three inline mentions to `dolly:`. So a sentence explaining what the OLD markers were called now names the new ones — the meaning is inverted. Read step 0009 with that in mind: those three examples were written as `dollie:`.

It also meant `migrate` was not idempotent: every run found "new" prose to rewrite. The earlier claim of idempotency held only for structure, not for content.

## Why it did not corrupt the store

Verified before fixing: all 8 step blocks still parse, marker pairs balanced, `stepEntries()` returns 8. The mangled mentions were mid-line and inside backticks, so none became a line-start marker. Had one been at line start, the rewrite would have promoted quoted text into a live `&lt;!-- dolly:step … -->` and fragmented steps.md — the same class of failure as the marker-injection bug found two turns ago, arriving from the opposite direction.

## Fix

`rewriteMarkers()` now matches only:
- at the start of a line (`^`, multiline) — which is how dolly writes every marker
- a **known** marker name: `header`, `instructions`, `spec-current`, `spec-history`, `step <id>`, or the space-form header comments `dollie spec|steps|plan`

Both conditions are required, so an inline mention cannot be touched and an unrecognised name cannot be promoted. A test asserts prose containing three marker-shaped strings survives verbatim while the surrounding real markers migrate, and that `listBlocks` finds no phantom block.

## Not rewriting history

The mangled text in step 0009 stays as it is. Hand-editing `.dolly/**` is the one thing the tool tells agents never to do, and this correction is the sanctioned remedy: a new append-only entry stating what the original said. The prose is wrong; the record of it being wrong is now right.
<!-- /dolly:step 0010 -->
