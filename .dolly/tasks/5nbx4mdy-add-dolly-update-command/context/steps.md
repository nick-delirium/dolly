<!-- dolly steps · task 5nbx4mdy · append-only, newest at the bottom -->
# Full step context — Add dolly update command

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001 -->
## 0001 · 2026-08-25T17:22:20Z · @nick.delirium

- task status: working
- files: `.claude/commands/dolly/board.md`, `.claude/commands/dolly/checkpoint.md`, `.claude/commands/dolly/housekeep.md`, `.claude/commands/dolly/memo.md`, `.claude/skills/dolly/SKILL.md`, `.opencode/commands/dolly-adopt.md`, `.opencode/commands/dolly-board.md`, `.opencode/commands/dolly-checkpoint.md`, `.opencode/commands/dolly-housekeep.md`, `.opencode/commands/dolly-memo.md`, `.opencode/commands/dolly-plan.md`, `.opencode/commands/dolly-resume.md`, `.opencode/commands/dolly-spec.md`, `.opencode/commands/dolly-step.md`, `.opencode/commands/dolly-validate.md`, `.opencode/plugins/dolly.js`, `.opencode/skills/dolly-planning/SKILL.md`, `.opencode/skills/dolly/SKILL.md`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `commands/board.md`, `commands/checkpoint.md`, `commands/housekeep.md`, `commands/memo.md`, `commands/update.md`, `opencode.json`, `skills/dolly/SKILL.md`, `src/cli.ts`, `src/core/fuzzy.ts`, `src/core/housekeep.ts`, `src/core/memo.ts`, `src/core/related.ts`, `src/core/render.ts`, `src/core/selfupdate.ts`, `src/core/store.ts`, `src/core/task.ts`, `src/core/transcript.ts`, `src/core/types.ts`, `src/core/update.ts`, `src/install.ts`, `src/mcp.ts`, `src/migrate.ts`, `src/prompt.ts`, `src/reindex.ts`, `src/templates/instructions.ts`, `src/wizard.ts`, `tests/fuzzy.test.mjs`, `tests/hooks.test.mjs`, `tests/housekeep.test.mjs`, `tests/install.test.mjs`, `tests/memo.test.mjs`, `tests/migrate.test.mjs`, `tests/picker.test.mjs`, `tests/project.test.mjs`, `tests/reindex.test.mjs`, `tests/store-index.test.mjs`, `tests/task.test.mjs`, `tests/transcript-opencode.test.mjs`, `tests/update.test.mjs`, `tests/version.test.mjs`, `tests/wizard.test.mjs`

## What landed

- **src/core/selfupdate.ts** (new): planUpdate(kind) → steps + reason.
  clone: git -C <root> pull --ff-only, then npm --prefix <root> install (prepare rebuilds).
  package: npm i -g github:<slug>. dirtyClone() counts porcelain lines pre-pull;
  applyPlan() runs steps with captured output. installedVersion() re-reads
  package.json from disk so post-update it reports the NEW version (VERSION const
  is module-load-time).
- **cli cmdUpdate**: --check compares against remote tags via latestFromGitForCheck
  (exported from core/update; explicit command = in-band network is fine);
  --dry-run prints the plan and skips the dirty check entirely (dry-run must
  always be allowed to look); dirty clone refuses without --force; after apply,
  prints old → new and reminds that running sessions keep the old binary until
  restart. Order matters: dry-run check BEFORE dirty refusal.
- **Notice text** now says "run: dolly update" instead of raw shell commands.
- **Slash-command rename**: /dolly:update (checkpoint) collided with the new CLI
  self-update verb — renamed to /dolly:checkpoint everywhere (file, README x2).

## Design choices for the user's "better idea?"

- Detection stays installKind(): realpath of module path contains .git → clone.
  npm link symlinks resolve through, so link == clone automatically. No new signal needed.
- Not on npm yet → package path reinstalls from github:. When published, add a
  registry fallback to planUpdate('package') — noted, not built.
- Never automatic: no timer, no hook runs update. The passive notice only suggests.
<!-- /dolly:step 0001 -->
