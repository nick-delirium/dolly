<!-- dolly steps · task jd8s6t23 · append-only, newest at the bottom -->
# Full step context — autolog smoke test

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001 -->
## 0001 · 2026-08-08T03:13:39Z · @rjshrjndrn

- task status: working
- files: none
- source: pi session 019fdf5c-9ccd-7b19-b83c-845ac8f8f27d · turn 019fdf5c-9ccd-7b19-b83c-845ac8f8f27d:0

tools: bash

_Auto-logged by the pi extension from the turn_end event, not written by a human. Correct it with a follow-up `dolly step` if it misleads._
<!-- /dolly:step 0001 -->

<!-- dolly:step 0002 -->
## 0002 · 2026-08-08T03:13:40Z · @rjshrjndrn

- task status: working
- files: none
- source: pi session 019fdf5c-9ccd-7b19-b83c-845ac8f8f27d · turn 019fdf5c-9ccd-7b19-b83c-845ac8f8f27d:1

It printed `dolly-autolog-probe`.

_Auto-logged by the pi extension from the turn_end event, not written by a human. Correct it with a follow-up `dolly step` if it misleads._
<!-- /dolly:step 0002 -->

<!-- dolly:step 0003 -->
## 0003 · 2026-08-25T17:42:29Z · @nick.delirium

- task status: working
- files: `.claude/commands/dolly/board.md`, `.claude/commands/dolly/checkpoint.md`, `.claude/commands/dolly/memo.md`, `.claude/skills/dolly/SKILL.md`, `.opencode/commands/dolly-adopt.md`, `.opencode/commands/dolly-board.md`, `.opencode/commands/dolly-checkpoint.md`, `.opencode/commands/dolly-housekeep.md`, `.opencode/commands/dolly-memo.md`, `.opencode/commands/dolly-plan.md`, `.opencode/commands/dolly-resume.md`, `.opencode/commands/dolly-spec.md`, `.opencode/commands/dolly-step.md`, `.opencode/commands/dolly-validate.md`, `.opencode/plugins/dolly.js`, `.opencode/skills/dolly-planning/SKILL.md`, `.opencode/skills/dolly/SKILL.md`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `commands/board.md`, `commands/checkpoint.md`, `commands/housekeep.md`, `commands/memo.md`, `opencode.json`, `skills/dolly/SKILL.md`, `src/cli.ts`, `src/core/fuzzy.ts`, `src/core/housekeep.ts`, `src/core/memo.ts`, `src/core/related.ts`, `src/core/render.ts`, `src/core/selfupdate.ts`, `src/core/store.ts`, `src/core/task.ts`, `src/core/transcript.ts`, `src/core/types.ts`, `src/core/update.ts`, `src/install.ts`, `src/mcp.ts`, `src/migrate.ts`, `src/prompt.ts`, `src/reindex.ts`, `src/templates/instructions.ts`, `src/wizard.ts`, `tests/fuzzy.test.mjs`, `tests/hooks.test.mjs`, `tests/housekeep.test.mjs`, `tests/install.test.mjs`, `tests/memo.test.mjs`, `tests/migrate.test.mjs`, `tests/picker.test.mjs`, `tests/project.test.mjs`, `tests/reindex.test.mjs`, `tests/store-index.test.mjs`, `tests/task.test.mjs`, `tests/transcript-opencode.test.mjs`, `tests/update.test.mjs`, `tests/version.test.mjs`, `tests/wizard.test.mjs`

## Review findings (6 fixed, 2 noted)

FIXED
1. Agent docs still taught numeric ids: templates/instructions.ts ref line +
   SKILL.md examples (0003 continue, tree) → hash ids + fuzzy mention. These are
   injected into every session, so the stale format would have been re-taught forever.
2. memo filesTouchedToday read context/steps.md but short-log trailers live in
   task.md — digest never showed files. Also its lazy regex captured zero trailer
   lines; now greedy with a column-0 `- ` guard.
3. migrate flattenArchives rmrf'd archive/ unconditionally AFTER promising (on a
   name collision) to "leave archive copy in place" → silent data loss on exactly
   the path designed to be careful. Now only removes when leftovers == 0.
4. filterSelect prefilled query could empty the candidate list (fuzzy refs are not
   substrings of any label). Now falls back to showing all ranked candidates.
5. stdin auto-log never linkSession()ed the pi/opencode conversation id, so those
   sessions were invisible to dolly show/continue metadata. Known limit: `dolly
   continue` still launches `claude` only — opencode resume needs its own launcher,
   not built today.
6. README drift: "17 tools"→15 (two MCP tools died with housekeeping), "six other
   agents"→five, numeric-id examples in board/related prose → hashes.

NOTED, NOT FIXED
- update --check for package installs reads git tags of PKG_ROOT, which has no
  origin when npm-installed — prints "could not reach remote". Should fall back
  to the npm registry once dolly is published; deferred until then.
- related.ts still classifies legacy 'archived|restored|housekeeping' log lines —
  intentional: old stores keep those lines and they must keep parsing as notes.

Verified: 212/212 green after fixes; live digest shows files; statusline works
with hash ids.
<!-- /dolly:step 0003 -->
