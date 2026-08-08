---
id: "0006"
slug: pi-slash-commands-via-prompts
title: pi slash commands via prompts/
status: done
owner: rjshrjndrn
collaborators: [rjshrjndrn]
tags: []
steps: 18
spec_version: 1
created: 2026-08-08T03:31:38Z
updated: 2026-08-08T03:42:09Z
---

# 0006 · pi slash commands via prompts/

<!-- dolly:header -->
`done` · spec v1 · @rjshrjndrn · 18 steps · updated 2026-08-08 03:42Z
<!-- /dolly:header -->

## Spec

Install the 9 /dolly:* commands into pi as ~/.pi/agent/prompts/dolly-*.md. Transform Claude's inline !`cmd` exec syntax (unsupported by pi) into fenced bash blocks, matching pi's own prompt convention. Frontmatter and $ARGUMENTS already compatible.

## Success Criteria

- [ ] All 9 /dolly:* commands install as pi prompts: ~/.pi/agent/prompts/dolly-<name>.md (global) and <repo>/.pi/prompts/dolly-<name>.md (local)
- [ ] Inline !`cmd` exec is transformed to fenced bash blocks; no !` remains in any installed prompt
- [ ] Frontmatter (description, argument-hint) and $ARGUMENTS/${ARGUMENTS:-default} pass through untouched; a command with no inline-exec (plan.md) copies verbatim
- [ ] Install is idempotent and the full test suite passes
- [ ] A slash command works in a live pi session end-to-end

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-08-08 03:31Z` @rjshrjndrn: status todo → working.
- `2026-08-08 03:31Z` @rjshrjndrn: Ran bash.
  full: `steps.md#0001`
- `2026-08-08 03:31Z` @rjshrjndrn: Consistent pattern: `` !`CMD` `` lines → convert to fenced bash blocks. Let me check `plan.md` (no matches — does it differ?) then write RED tests:
  full: `steps.md#0002`
- `2026-08-08 03:32Z` @rjshrjndrn: `plan.md` already uses fenced blocks — transform leaves it untouched (no `` !` `` lines). Transform rule is clean: each `` !`CMD` `` line → fenced bash block. Writing RED tests:
  files: `/home/skyent/Documents/Projects/personal/dolly/tests/install.test.mjs` · full: `steps.md#0003`
- `2026-08-08 03:32Z` @rjshrjndrn: Ran edit.
  files: `/home/skyent/Documents/Projects/personal/dolly/tests/install.test.mjs` · full: `steps.md#0004`
- `2026-08-08 03:32Z` @rjshrjndrn: Wait — I assumed local prompts go to `.pi/prompts`. Must verify pi's local prompt discovery, same as I did for skills. Checking the resource loader:
  full: `steps.md#0005`
- `2026-08-08 03:32Z` @rjshrjndrn: Confirmed: global `~/.pi/agent/prompts/`, project `cwd/{CONFIG_DIR_NAME}/prompts/`. Verify `CONFIG_DIR_NAME` = `.pi`:
  full: `steps.md#0006`
- `2026-08-08 03:32Z` @rjshrjndrn: `.pi` confirmed. My test paths match — global `~/.pi/agent/prompts/`, local `.pi/prompts/`, consistent with skills. Run RED:
  full: `steps.md#0007`
- `2026-08-08 03:32Z` @rjshrjndrn: RED confirmed. Now implement — transform fn + prompt-copy in the pi target. Let me see the current pi target skills section to place it consistently:
  files: `/home/skyent/Documents/Projects/personal/dolly/src/install.ts` · full: `steps.md#0008`
- `2026-08-08 03:32Z` @rjshrjndrn: Ran read.
  files: `/home/skyent/Documents/Projects/personal/dolly/src/install.ts` · full: `steps.md#0009`
- `2026-08-08 03:32Z` @rjshrjndrn: Now check imports (need `fs`/`readdir` for listing commands + `basename`):
  full: `steps.md#0010`
- `2026-08-08 03:33Z` @rjshrjndrn: `fs` + `readTextOr`/`writeText` available. Adding the transform helper + a command-installer, then wiring into the pi target:
  files: `/home/skyent/Documents/Projects/personal/dolly/src/install.ts` · full: `steps.md#0011`
- `2026-08-08 03:33Z` @rjshrjndrn: Ran bash.
  full: `steps.md#0012`
- `2026-08-08 03:33Z` @rjshrjndrn: GREEN. Full suite + real install + eyeball a transformed prompt:
  full: `steps.md#0013`
- `2026-08-08 03:33Z` @rjshrjndrn: Ran bash.
  full: `steps.md#0014`
- `2026-08-08 03:33Z` @rjshrjndrn: **Board — dolly**
  full: `steps.md#0015`
- `2026-08-08 03:35Z` @rjshrjndrn: pi target installs the 9 slash commands as prompt templates (~/.pi/agent/prompts/dolly-*.md global, .pi/prompts local). toPiPrompt() rewrites Claude's inline !`cmd` exec into fenced bash blocks — the one syntax pi lacks; frontmatter and $ARGUMENTS already match. Proven live: 'pi -p /dolly-board' ran end-to-end. 101/101.
  files: `.gemini/settings.json`, `.pi/git-root.cache`, `.pi/memory.db`, `.pi/memory.db-shm`, `.pi/memory.db-wal`, `.pi/skills/dolly-planning/SKILL.md` +8 more · full: `steps.md#0016`
- `2026-08-08 03:35Z` @rjshrjndrn: Ran bash.
  full: `steps.md#0017`
- `2026-08-08 03:36Z` @rjshrjndrn: status working → validating. in an INTERACTIVE pi session (not -p), type /dolly- and confirm all 9 commands appear in the picker; run /dolly-step and /dolly-plan <feature> and confirm the fenced bash blocks execute and $ARGUMENTS substitutes. Then set done.
- `2026-08-08 03:39Z` @rjshrjndrn: All 5 success criteria verified with proof (files, test names install.test.mjs:185/:220, npm 101/101, live pi -p /dolly-board). Criteria were TBD at open; derived from spec and set before validating.
  files: `src/install.ts`, `tests/install.test.mjs` · full: `steps.md#0018`
- `2026-08-08 03:39Z` @rjshrjndrn: status validating → validating. interactive pi check (the one thing pi -p can't do)
- `2026-08-08 03:42Z` @rjshrjndrn: status validating → done.

