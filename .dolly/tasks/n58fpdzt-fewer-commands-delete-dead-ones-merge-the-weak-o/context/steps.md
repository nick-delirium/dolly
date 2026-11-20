<!-- dolly steps · task n58fpdzt · append-only, newest at the bottom -->
# Full step context — Fewer commands: delete dead ones, merge the weak ones

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001 -->
## 0001 · 2026-11-20T09:19:06Z · @nick-delirium

- task status: working
- files: `src/cli.ts`, `src/mcp.ts`, `src/core/render.ts`, `src/core/compact.ts`, `src/core/related.ts`, `src/core/task.ts`, `src/core/types.ts`, `src/core/store.ts`, `src/wizard.ts`, `src/templates/instructions.ts`, `skills/dolly/SKILL.md`, `commands/step.md`, `commands/validate.md`, `commands/spec.md`, `commands/plan.md`, `README.md`, `tests/commands.test.mjs`, `tests/compact.test.mjs`, `tests/wizard.test.mjs`, `tests/integrity.test.mjs`, `tests/mcp.test.mjs`, `tests/install.test.mjs`, `.dolly/project.md`

## Surface now (26 top-level, help-asserted)
board, context (alias show), project, recall, why, continue, new, step, spec, status, review, compact, dream, plan, reindex, init, install, config, projects, whoami, guide, update, migrate, mcp, hook, statusline. Hidden aliases kept: list/ls, show, add, move, adopt, resume.

## Removed → pointer (cli.ts `REMOVED`, checked in main() BEFORE flag parsing so old flags don't error first)
current→context · setup→init · retitle/rename→`spec --title` · related→`why <file...>` · defaults→`config --defaults` · version→`--version` · memo/digest→dream. `plan show` → in-command pointer to context. archive/restore stubs deleted (plain unknown command now).

## Decisions
- `show` kept as an ALIAS (not removed): slash commands and muscle memory use it, and it now renders exactly `context` (one renderer; renderShow deleted). `show --full` → `context --full` = every live step body (steps=0).
- `why`: 1 file → the existing full story (renderWhy). ≥2 files → `renderWhyMany`: relatedByFiles ranking (rarity-weighted) + merged commits (dedup by hash, 10 max). `--files a,b` accepted for `related` muscle memory. `related <ref>` has no replacement on purpose: `context` lists a task's related tasks.
- `spec --title`: retitle first (moves dir), then any other spec fields on the moved task.
- `init` on an existing store already opened the wizard in a TTY — `setup` was literally the same path; nothing new needed beyond messages ("dolly setup" → "dolly init" in wizard header, conflict warnings, store README template).
- MCP: `dolly_related` → `dolly_why` (files required); `dolly_task_show` removed (dolly_context covers it); `dolly_spec_update` gained `title`. 13 tools, 7660B.
- Digest code deleted (digest.ts, compact.ts digest half, board folding, context "rolled into digest" line, setDigest). `TaskMeta.digest` is still READ and WRITTEN back so saving a task in an older store never drops the key.
- memo.ts deleted; recall indexes legacy memo/ + digests/ as kind dream.

## Bug caught by tests
MCP spec_update with no args returned "retitled" — early return wasn't gated on `title`. Fixed.

## Guards
tests/commands.test.mjs: removal stubs, help ≤ 26 + no removed names, docs/prompt/AGENT_BLOCK scan for removed names, show==context, --full, config --defaults, spec --title, why many/one, MCP surface.

## Docs touched
AGENT_BLOCK (related→why), skills/dolly (why, dream, spec --title, `--criteria` replaces the whole list — a trap I hit on this run), commands/{step,validate,spec,plan}.md (show→context), README (command reference rewritten, removal list), store README template, project brief Architecture.
<!-- /dolly:step 0001 -->
