<!-- dolly steps · task 0006 · append-only, newest at the bottom -->
# Full step context — pi slash commands via prompts/

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001 -->
## 0001 · 2026-08-08T03:31:44Z · @rjshrjndrn

- task status: working
- files: none
- source: pi session 019fdd9f-88e3-71fe-94af-81d9c01c546f · turn 019fdd9f-88e3-71fe-94af-81d9c01c546f:1

tools: bash

_Auto-logged by the pi extension from the turn_end event, not written by a human. Correct it with a follow-up `dolly step` if it misleads._
<!-- /dolly:step 0001 -->

<!-- dolly:step 0002 -->
## 0002 · 2026-08-08T03:31:54Z · @rjshrjndrn

- task status: working
- files: none
- source: pi session 019fdd9f-88e3-71fe-94af-81d9c01c546f · turn 019fdd9f-88e3-71fe-94af-81d9c01c546f:2

Consistent pattern: `` !`CMD` `` lines → convert to fenced bash blocks. Let me check `plan.md` (no matches — does it differ?) then write RED tests:

tools: bash

_Auto-logged by the pi extension from the turn_end event, not written by a human. Correct it with a follow-up `dolly step` if it misleads._
<!-- /dolly:step 0002 -->

<!-- dolly:step 0003 -->
## 0003 · 2026-08-08T03:32:03Z · @rjshrjndrn

- task status: working
- files: `/home/skyent/Documents/Projects/personal/dolly/tests/install.test.mjs`
- source: pi session 019fdd9f-88e3-71fe-94af-81d9c01c546f · turn 019fdd9f-88e3-71fe-94af-81d9c01c546f:3

`plan.md` already uses fenced blocks — transform leaves it untouched (no `` !` `` lines). Transform rule is clean: each `` !`CMD` `` line → fenced bash block. Writing RED tests:

tools: read

_Auto-logged by the pi extension from the turn_end event, not written by a human. Correct it with a follow-up `dolly step` if it misleads._
<!-- /dolly:step 0003 -->

<!-- dolly:step 0004 -->
## 0004 · 2026-08-08T03:32:19Z · @rjshrjndrn

- task status: working
- files: `/home/skyent/Documents/Projects/personal/dolly/tests/install.test.mjs`
- source: pi session 019fdd9f-88e3-71fe-94af-81d9c01c546f · turn 019fdd9f-88e3-71fe-94af-81d9c01c546f:4

tools: edit

_Auto-logged by the pi extension from the turn_end event, not written by a human. Correct it with a follow-up `dolly step` if it misleads._
<!-- /dolly:step 0004 -->

<!-- dolly:step 0005 -->
## 0005 · 2026-08-08T03:32:28Z · @rjshrjndrn

- task status: working
- files: none
- source: pi session 019fdd9f-88e3-71fe-94af-81d9c01c546f · turn 019fdd9f-88e3-71fe-94af-81d9c01c546f:5

Wait — I assumed local prompts go to `.pi/prompts`. Must verify pi's local prompt discovery, same as I did for skills. Checking the resource loader:

tools: bash

_Auto-logged by the pi extension from the turn_end event, not written by a human. Correct it with a follow-up `dolly step` if it misleads._
<!-- /dolly:step 0005 -->

<!-- dolly:step 0006 -->
## 0006 · 2026-08-08T03:32:38Z · @rjshrjndrn

- task status: working
- files: none
- source: pi session 019fdd9f-88e3-71fe-94af-81d9c01c546f · turn 019fdd9f-88e3-71fe-94af-81d9c01c546f:6

Confirmed: global `~/.pi/agent/prompts/`, project `cwd/{CONFIG_DIR_NAME}/prompts/`. Verify `CONFIG_DIR_NAME` = `.pi`:

tools: bash

_Auto-logged by the pi extension from the turn_end event, not written by a human. Correct it with a follow-up `dolly step` if it misleads._
<!-- /dolly:step 0006 -->

<!-- dolly:step 0007 -->
## 0007 · 2026-08-08T03:32:44Z · @rjshrjndrn

- task status: working
- files: none
- source: pi session 019fdd9f-88e3-71fe-94af-81d9c01c546f · turn 019fdd9f-88e3-71fe-94af-81d9c01c546f:7

`.pi` confirmed. My test paths match — global `~/.pi/agent/prompts/`, local `.pi/prompts/`, consistent with skills. Run RED:

tools: bash

_Auto-logged by the pi extension from the turn_end event, not written by a human. Correct it with a follow-up `dolly step` if it misleads._
<!-- /dolly:step 0007 -->

<!-- dolly:step 0008 -->
## 0008 · 2026-08-08T03:32:47Z · @rjshrjndrn

- task status: working
- files: `/home/skyent/Documents/Projects/personal/dolly/src/install.ts`
- source: pi session 019fdd9f-88e3-71fe-94af-81d9c01c546f · turn 019fdd9f-88e3-71fe-94af-81d9c01c546f:8

RED confirmed. Now implement — transform fn + prompt-copy in the pi target. Let me see the current pi target skills section to place it consistently:

tools: read

_Auto-logged by the pi extension from the turn_end event, not written by a human. Correct it with a follow-up `dolly step` if it misleads._
<!-- /dolly:step 0008 -->

<!-- dolly:step 0009 -->
## 0009 · 2026-08-08T03:32:51Z · @rjshrjndrn

- task status: working
- files: `/home/skyent/Documents/Projects/personal/dolly/src/install.ts`
- source: pi session 019fdd9f-88e3-71fe-94af-81d9c01c546f · turn 019fdd9f-88e3-71fe-94af-81d9c01c546f:9

tools: read

_Auto-logged by the pi extension from the turn_end event, not written by a human. Correct it with a follow-up `dolly step` if it misleads._
<!-- /dolly:step 0009 -->

<!-- dolly:step 0010 -->
## 0010 · 2026-08-08T03:32:55Z · @rjshrjndrn

- task status: working
- files: none
- source: pi session 019fdd9f-88e3-71fe-94af-81d9c01c546f · turn 019fdd9f-88e3-71fe-94af-81d9c01c546f:10

Now check imports (need `fs`/`readdir` for listing commands + `basename`):

tools: bash

_Auto-logged by the pi extension from the turn_end event, not written by a human. Correct it with a follow-up `dolly step` if it misleads._
<!-- /dolly:step 0010 -->

<!-- dolly:step 0011 -->
## 0011 · 2026-08-08T03:33:11Z · @rjshrjndrn

- task status: working
- files: `/home/skyent/Documents/Projects/personal/dolly/src/install.ts`
- source: pi session 019fdd9f-88e3-71fe-94af-81d9c01c546f · turn 019fdd9f-88e3-71fe-94af-81d9c01c546f:11

`fs` + `readTextOr`/`writeText` available. Adding the transform helper + a command-installer, then wiring into the pi target:

tools: edit

_Auto-logged by the pi extension from the turn_end event, not written by a human. Correct it with a follow-up `dolly step` if it misleads._
<!-- /dolly:step 0011 -->

<!-- dolly:step 0012 -->
## 0012 · 2026-08-08T03:33:18Z · @rjshrjndrn

- task status: working
- files: none
- source: pi session 019fdd9f-88e3-71fe-94af-81d9c01c546f · turn 019fdd9f-88e3-71fe-94af-81d9c01c546f:12

tools: bash

_Auto-logged by the pi extension from the turn_end event, not written by a human. Correct it with a follow-up `dolly step` if it misleads._
<!-- /dolly:step 0012 -->

<!-- dolly:step 0013 -->
## 0013 · 2026-08-08T03:33:24Z · @rjshrjndrn

- task status: working
- files: none
- source: pi session 019fdd9f-88e3-71fe-94af-81d9c01c546f · turn 019fdd9f-88e3-71fe-94af-81d9c01c546f:13

GREEN. Full suite + real install + eyeball a transformed prompt:

tools: bash

_Auto-logged by the pi extension from the turn_end event, not written by a human. Correct it with a follow-up `dolly step` if it misleads._
<!-- /dolly:step 0013 -->

<!-- dolly:step 0014 -->
## 0014 · 2026-08-08T03:33:38Z · @rjshrjndrn

- task status: working
- files: none
- source: pi session 019fdf6e-e740-732f-9771-ce977d6bd82c · turn 019fdf6e-e740-732f-9771-ce977d6bd82c:0

tools: bash

_Auto-logged by the pi extension from the turn_end event, not written by a human. Correct it with a follow-up `dolly step` if it misleads._
<!-- /dolly:step 0014 -->

<!-- dolly:step 0015 -->
## 0015 · 2026-08-08T03:33:48Z · @rjshrjndrn

- task status: working
- files: none
- source: pi session 019fdf6e-e740-732f-9771-ce977d6bd82c · turn 019fdf6e-e740-732f-9771-ce977d6bd82c:1

**Board — dolly**

```
◐ WORKING     0006  pi slash commands via prompts/   @rjshrjndrn   now    13✎   ← ACTIVE
◑ VALIDATING  0001  Build dolly (core)               @nick         16h    15✎   spec v2  ← needs human
◍ PLANNING    0002  task.md from append-only log     @nick         17h    0✎           ← stale/empty
● DONE        0003  pi install target · 0004  pi hook ext
⌸ ARCHIVED    0005  autolog smoke test
```

**In flight** — `0006` pi slash commands. 13 steps, last one GREEN (full suite + real install + eyeballed transformed prompt). Looks complete but still `working`, not moved to `validating`.

**Waits on human** — `0001` core build sitting in `validating` 16h. Human must verify + set `done`.

**Stale** — `0002` in `planning` 17h, **0 steps**. Never started. Either finalize the plan or drop it.

**Active task:** `0006 pi slash commands via prompts/`.

**Next action:** `0006` last step is GREEN. Run `dolly context 0006`, confirm criteria met, then `dolly status 0006 validating --note "<what to check>"`. Don't leave finished work in `working`.

_Auto-logged by the pi extension from the turn_end event, not written by a human. Correct it with a follow-up `dolly step` if it misleads._
<!-- /dolly:step 0015 -->

<!-- dolly:step 0016 -->
## 0016 · 2026-08-08T03:35:25Z · @rjshrjndrn

- task status: working
- files: `.gemini/settings.json`, `.pi/git-root.cache`, `.pi/memory.db`, `.pi/memory.db-shm`, `.pi/memory.db-wal`, `.pi/skills/dolly-planning/SKILL.md`, `.pi/skills/dolly/SKILL.md`, `.windsurf/rules/dolly.md`, `AGENTS.md`, `GEMINI.md`, `opencode.json`, `package-lock.json`, `src/install.ts`, `tests/install.test.mjs`

## pi slash commands as prompt templates

The pi target now installs the 9 /dolly:* commands as pi prompts:
  ~/.pi/agent/prompts/dolly-<name>.md  (global)
  <repo>/.pi/prompts/dolly-<name>.md   (local)
Both paths verified in pi's prompt-templates.js discovery (global
agentDir/prompts, project CONFIG_DIR_NAME/prompts; CONFIG_DIR_NAME=".pi").

### The one incompatibility, and the fix
pi shares our frontmatter (description, argument-hint) AND $ARGUMENTS /
${ARGUMENTS:-default} substitution (prompt-templates.js:46-47, regex on
:58). The ONLY gap: Claude's inline `!`cmd`` execution (runs the cmd and
injects output). pi has no such syntax — pi's own prompts use fenced bash
blocks the agent runs. toPiPrompt() rewrites each `!`cmd`` line into a
```bash\ncmd\n``` block; everything else passes through. allowed-tools
frontmatter is left in place (pi ignores it, harmless).

Naming: pi prompts are flat files -> /dolly-board (filename), not Claude's
namespaced /dolly:board.

### Proven
- 2 new install tests (global transform of all 9 + no `!` remains +
  ```bash blocks + $ARGUMENTS survives + plan.md untouched; local writes
  to .pi/prompts). Suite 101/101.
- End-to-end: `pi -p "/dolly-board"` in a live pi session discovered the
  prompt, ran the fenced block, and printed the real board. Not mocked.

Human check: /dolly-step, /dolly-plan etc. in an interactive pi session.
<!-- /dolly:step 0016 -->

<!-- dolly:step 0017 -->
## 0017 · 2026-08-08T03:35:34Z · @rjshrjndrn

- task status: working
- files: none
- source: pi session 019fdd9f-88e3-71fe-94af-81d9c01c546f · turn 019fdd9f-88e3-71fe-94af-81d9c01c546f:16

tools: bash

_Auto-logged by the pi extension from the turn_end event, not written by a human. Correct it with a follow-up `dolly step` if it misleads._
<!-- /dolly:step 0017 -->

<!-- dolly:step 0018 -->
## 0018 · 2026-08-08T03:39:49Z · @rjshrjndrn

- task status: validating
- files: `src/install.ts`, `tests/install.test.mjs`

## Final: all 5 success criteria verified

Criteria were TBD at task open (dolly new without --criteria); derived
from the spec and set via `dolly spec 0006 --criteria ...`, then each
checked against hard proof.

C1 nine prompts, global+local — ls ~/.pi/agent/prompts/dolly-*.md = 9;
   local asserted by test install.test.mjs:220.
C2 no inline exec — grep -lF '!`' over all 9 = clean; ```bash present
   (board 1, step 2); test install.test.mjs:185.
C3 frontmatter + $ARGUMENTS preserved; plan.md diff = IDENTICAL to source.
C4 idempotent — rerun = 9 "up-to-date" prompt lines; npm test 101/101.
C5 live — pi -p "/dolly-board" ran end-to-end, printed the board, exit 0.

All met. Moving to validating for the interactive-picker check only a human
can do (-p cannot exercise the /dolly- completion menu).
<!-- /dolly:step 0018 -->
