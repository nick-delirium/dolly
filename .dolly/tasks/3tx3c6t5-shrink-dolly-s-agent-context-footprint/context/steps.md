<!-- dolly steps · task 3tx3c6t5 · append-only, newest at the bottom -->
# Full step context — Shrink dolly's agent context footprint

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001 -->
## 0001 · 2026-09-29T14:40:47Z · @nick-delirium

- task status: working
- files: `src/cli.ts`, `src/core/render.ts`, `src/core/project.ts`, `src/reindex.ts`, `src/core/lock.ts`, `tests/hooks.test.mjs`, `tests/cli-args.test.mjs`, `tests/memo.test.mjs`, `tests/wizard.test.mjs`, `tests/autolog-target.test.mjs`

## Footprint slice 1: session-start, dolly context, auto-step bodies

Measured on this repo (bytes):
- session-start: 5086 → 1853. `sessionStartContext()` in cli.ts: store line, brief = Overview only (700 cap) + pointer to other sections, recently finished = 3 titles on one line (no 160-char outcomes), ONE task: "This conversation's task" (session-linked) or "Most recent open task" with the attach command; spec + last log line only if session-linked or updated < 7 days; no criteria, no 6-event tail, no "How to read the rest" paragraph (the instruction block covers it).
- dolly context: 6qp6wxbq 45.8K → 19.7K (−57%), v94p7gqv 57.2K → 34.5K (−40%), 6mq9hmg4 34.1K → 29.9K (hand-written steps dominate; they stay whole).
  - header = one line; brief = Overview/Invariants/Conventions capped 1500 each at line boundaries (projectDigest now section-aware: `{sections, maxPerSection}`), rest named in a pointer.
  - plan.md only while status is planning (after finalize it IS the spec) — pointer line otherwise.
  - task.md criteria canonical: the full spec's own `## Success Criteria` section is dropped in the render (in v94p7gqv the two had diverged — stale copy).
  - log: last 20 entries, trailers stripped (files listed once above), entries clipped at 500.
  - `compactStep`: auto-logged steps (have Work chain/Commands run) keep "What the agent said" (2000) + Files + Request (500); drop Work chain/Commands/Tools. Splits ONLY on the importer's own section names (AUTO_SECTIONS) — agent messages carry their own headings.
  - relatedByFiles computed from one filesOfTask call (was twice).
- reindex stepDetail (stored): earlier assistant messages as one line each + last message whole; no "Commands run" (dup of `Bash:` work-chain lines); work chain capped 25; Tools as a heading line; request clipped 1500.

Found while testing: store lock race — open('wx') then write left an empty lock file visible; a waiter read pid '' → "dead" → deleted a LIVE lock (8 parallel steps → 7). Fixed with write-tmp + link() (atomic, fails on EEXIST); stale removal re-checks content before rm.
Also a flaky test of mine (two tasks in the same second tie on recency) — backdated with ageTask.
<!-- /dolly:step 0001 -->

<!-- dolly:step 0002 -->
## 0002 · 2026-09-29T14:45:38Z · @nick-delirium

- task status: working
- files: `src/templates/instructions.ts`, `src/cli.ts`, `src/mcp.ts`, `src/core/types.ts`, `skills/dolly/SKILL.md`, `skills/dolly-planning/SKILL.md`, `commands/board.md`, `commands/checkpoint.md`, `README.md`, `CLAUDE.md`, `AGENTS.md`, `.claude/settings.json`, `tests/footprint.test.mjs`, `tests/install.test.mjs`, `tests/wizard.test.mjs`

## Footprint slice 2: instructions, skills, guide, MCP, commands

- AGENT_BLOCK 6225 → 1551 bytes: 8 bullets of essentials (context before code, status working attaches, step = outcome + handoff notes, spec versioning, validating/never done, plan features, project brief vs step, newer-store rule). Points at the **dolly** skill / `dolly guide`.
- `dolly guide [planning]`: prints skills/<name>/SKILL.md minus frontmatter from PKG_ROOT — the full guide for agents with no skill support (cursor/codex/gemini/copilot/windsurf get only the block).
- skills/dolly/SKILL.md 10.6KB → 6.1KB: dropped layout/example sections, merged code-map/not-initialized/continue into rules, added the attach semantics. Descriptions (listed in EVERY session) trimmed: dolly 470 → ~250 chars, dolly-planning 420 → ~240.
- MCP: DEFAULT install.mcp=false (every target has a shell; CLI is the same surface). Tool list 9670 → 7549 bytes: one-line descriptions, short param descriptions. Repo's own .dolly/config.json keeps mcp:true explicitly, so this repo still registers it.
- commands/checkpoint.md removed (duplicate of step); board hint no longer advertises the no-op --all. Reinstalling pruned checkpoint + housekeep from .claude/commands/dolly and .opencode/commands.
- Repo's own generated copies regenerated with `dolly install claude opencode`: CLAUDE.md/AGENTS.md 6353 → 1629, guarded hooks in .claude/settings.json, synced skills/commands, new opencode plugin.
- README: MCP opt-in, session-start/context shapes, auto-step layout, dolly guide, footprint budgets.
- tests/footprint.test.mjs (8): block/skill/MCP budgets, guide, finalized-plan + criteria dedup, compactStep (agent's own headings survive), log cap/trailers, session-start staleness gating.

Totals for a Claude Code session in this repo: block 6.2K + session-start 5.1K → 1.6K + 1.9K. Plus the user's stale global ~/.claude/CLAUDE.md block (6K) — user env, not the repo; flagged to the user.
Suite 284/284, tsc --noUnusedLocals clean.
<!-- /dolly:step 0002 -->
