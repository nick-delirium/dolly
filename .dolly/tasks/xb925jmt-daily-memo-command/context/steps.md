<!-- dolly steps · task xb925jmt · append-only, newest at the bottom -->
# Full step context — Daily memo command

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001 -->
## 0001 · 2026-08-25T17:07:08Z · @nick.delirium

- task status: working
- files: none
- source: opencode session ses_fc61f1b30ffeba6e56SibpVa4d · turn ses_fc61f1b30ffeba6e56SibpVa4d:1

The `dolly memo` digest already runs. Let me see the full output before writing the memo.
Full digest in hand. Writing the memo prose to a temp file and saving it through the command itself.
Memo saved → `.dolly/memo/2026-08-25.md`

# Memo — 2026-08-25

Opencode parity shipped and two store cleanups landed, all in dolly itself.

- `twjnrqcd Add opencode support` → **done**: opencode reaches Claude Code parity — skills, slash commands and MCP via the installer; a generated plugin injects task context into every LLM call (system.transform, survives compaction) and auto-logs each turn; finished by adding `direct:true` commands so `/dolly-board` prints without a model response.
- `3pkndyj2 Hash task ids + fuzzy title matching` → validating: task ids are now 8-char vowel-free hashes; every ref accepts id/slug/substring/fuzzy title, ambiguous matches open an interactive type-to-filter picker; v6 migration rewrote task dirs.
- `2rhqyc8c Scrap archiving and time-based housekeeping` → validating: housekeep/archive/restore commands, auto-runs, config keys, MCP tools and the board ARCHIVED section are gone; v5 migration flattens `archive/` back into `tasks/`.
- Picked up `xb925jmt Daily memo command` (working): spec v2 after planning — digest over task logs + transcripts + git, prose saved to `.dolly/memo/YYYY-MM-DD.md`. This memo is its first live run.

Hanging: both validating tasks await human checks (migration diff shape on 2rhqyc8c, TTY picker via `dolly continue <title>` on 3pkndyj2). Git shows no commits today. Stray fixture task `h8xwnkq4 Parse me` sits on the todo board and should probably be deleted.

tools: skill, dolly_dolly_context, bash, read, write

_Auto-logged by the opencode extension from the turn-end event, not written by a human. Correct it with a follow-up `dolly step` if it misleads._
<!-- /dolly:step 0001 -->

<!-- dolly:step 0002 -->
## 0002 · 2026-08-25T17:08:27Z · @nick.delirium

- task status: working
- files: `.claude/commands/dolly/board.md`, `.claude/commands/dolly/housekeep.md`, `.claude/commands/dolly/memo.md`, `.claude/skills/dolly/SKILL.md`, `.opencode/commands/dolly-adopt.md`, `.opencode/commands/dolly-board.md`, `.opencode/commands/dolly-housekeep.md`, `.opencode/commands/dolly-memo.md`, `.opencode/commands/dolly-plan.md`, `.opencode/commands/dolly-resume.md`, `.opencode/commands/dolly-spec.md`, `.opencode/commands/dolly-step.md`, `.opencode/commands/dolly-update.md`, `.opencode/commands/dolly-validate.md`, `.opencode/plugins/dolly.js`, `.opencode/skills/dolly-planning/SKILL.md`, `.opencode/skills/dolly/SKILL.md`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `commands/board.md`, `commands/housekeep.md`, `commands/memo.md`, `opencode.json`, `skills/dolly/SKILL.md`, `src/cli.ts`, `src/core/fuzzy.ts`, `src/core/housekeep.ts`, `src/core/memo.ts`, `src/core/related.ts`, `src/core/render.ts`, `src/core/store.ts`, `src/core/task.ts`, `src/core/transcript.ts`, `src/core/types.ts`, `src/install.ts`, `src/mcp.ts`, `src/migrate.ts`, `src/prompt.ts`, `src/reindex.ts`, `src/templates/instructions.ts`, `src/wizard.ts`, `tests/fuzzy.test.mjs`, `tests/hooks.test.mjs`, `tests/housekeep.test.mjs`, `tests/install.test.mjs`, `tests/memo.test.mjs`, `tests/migrate.test.mjs`, `tests/picker.test.mjs`, `tests/project.test.mjs`, `tests/reindex.test.mjs`, `tests/store-index.test.mjs`, `tests/task.test.mjs`, `tests/transcript-opencode.test.mjs`, `tests/version.test.mjs`, `tests/wizard.test.mjs`

## What landed

- **src/core/memo.ts** (new): buildDigest(store, date) aggregates three sources —
  task log lines parsed from the short-log format (eventsOn), transcript segments
  within the local-time day (listSessions + parseTranscript over BOTH claude and
  opencode mirrors), git log for the window. renderDigest prints it bounded like
  reindex's digest. memoFile/hasMemo/today helpers; dates are LOCAL time.
- **cli.ts cmdMemo**: `dolly memo [--date] [--json]` digest; `--save --file f|-`
  writes .dolly/memo/<date>.md (mkdir -p, overwrite = correction, refuses empty).
  In WRITE_COMMANDS. Session-start hint when config.memo.auto && !hasMemo(today).
- **config**: new `memo: { auto: false }` section; parseConfig merges it so old
  configs gain the default.
- **commands/memo.md** → /dolly-memo in claude + opencode via existing installers.

## Gotchas

- Re-resolving transcripts by 8-char prefix collides between sibling session ids
  (ses_fc68a4 vs ses_fc68be share 'ses_fc68') — resolveSession throws ambiguous,
  the error was swallowed by the per-session catch, and conversations silently
  came out empty. Fix: parseTranscript(ref) on the ref listSessions already gave.
- createTask logs NO "created" line — frontmatter created is the record. Tests
  asserting event counts must expect steps only.
- ageTask() rewinds frontmatter only; log-line stamps need a separate pass.
- An env-pinned store's `.project` is the CLI's cwd, NOT DOLLY_DIR's parent —
  mirror fixtures must key off store.project.
- A debug run without DOLLY_DIR created a real junk task in this repo
  (h8xwnkq4-parse-me); deleted manually. Lesson: direct core/ calls inherit cwd.

## Verified live

opencode /dolly-memo produced a real prose memo of today's work and saved it to
.dolly/memo/2026-08-25.md via dolly memo --save.
<!-- /dolly:step 0002 -->
