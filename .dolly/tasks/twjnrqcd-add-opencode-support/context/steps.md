<!-- dolly steps · task twjnrqcd · append-only, newest at the bottom -->
# Full step context — Add opencode support

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001 -->
## 0001 · 2026-08-25T14:51:48Z · @nick.delirium

- task status: working
- files: none
- source: opencode session ses_fc698a5f0ffebP9sMQdUFw595J · turn ses_fc698a5f0ffebP9sMQdUFw595J:1

0001 (validating), 0002 (planning), 0007 (working)

tools: bash

_Auto-logged by the opencode extension from the turn-end event, not written by a human. Correct it with a follow-up `dolly step` if it misleads._
<!-- /dolly:step 0001 -->

<!-- dolly:step 0002 -->
## 0002 · 2026-08-25T14:54:59Z · @nick.delirium

- task status: working
- files: none
- source: opencode session ses_fc6958779ffesqHgkobhbUpDGf · turn ses_fc6958779ffesqHgkobhbUpDGf:1

```
dolly · /Users/delirium/Documents/code/dolly/.dolly

◍ PLANNING  (1)
  0002  Generated task.md from an append-only log  @nick-delirium  18d ago  0✎

◐ WORKING  (1)
  0007  Add opencode support  @nick.delirium  just now  1✎  spec v2

◑ VALIDATING  (1)
  0001  Build dolly: agent memory and task planning  @nick-delirium  18d ago  15✎  spec v2
```

active task: **0007 add-opencode-support** — run `dolly context current` to pick it back up.

tools: dolly_dolly_board

_Auto-logged by the opencode extension from the turn-end event, not written by a human. Correct it with a follow-up `dolly step` if it misleads._
<!-- /dolly:step 0002 -->

<!-- dolly:step 0003 -->
## 0003 · 2026-08-25T14:55:38Z · @nick.delirium

- task status: working
- files: `.opencode/commands/dolly-adopt.md`, `.opencode/commands/dolly-board.md`, `.opencode/commands/dolly-housekeep.md`, `.opencode/commands/dolly-plan.md`, `.opencode/commands/dolly-resume.md`, `.opencode/commands/dolly-spec.md`, `.opencode/commands/dolly-step.md`, `.opencode/commands/dolly-update.md`, `.opencode/commands/dolly-validate.md`, `.opencode/plugins/dolly.js`, `.opencode/skills/dolly-planning/SKILL.md`, `.opencode/skills/dolly/SKILL.md`, `AGENTS.md`, `README.md`, `opencode.json`, `src/cli.ts`, `src/core/transcript.ts`, `src/install.ts`, `src/reindex.ts`, `tests/install.test.mjs`, `tests/transcript-opencode.test.mjs`

## What landed

opencode is now a first-class target at Claude Code parity:

- **install.ts** — opencode target writes `.opencode/skills/{dolly,dolly-planning}`,
  `.opencode/commands/dolly-*.md` (passed through UNtransformed: opencode runs `` !`cmd` ``
  natively, unlike pi), `.opencode/plugins/dolly.js`, AGENTS.md block, `opencode.json`
  mcp entry. Global scope resolves under ~/.config/opencode. installNamedPrompts()
  gained an `exec` flag to share between pi (rewrite) and opencode (raw).
- **Generated plugin** (.opencode/plugins/dolly.js, untyped like PI_EXTENSION):
  - `experimental.chat.system.transform` injects `dolly hook session-start --raw` into
    every LLM call — fires per call so context is never staler than last turn; cached 30s,
    invalidated on `chat.message`.
  - `experimental.session.compacting` re-injects context across compaction.
  - `session.idle` = turn end: pulls turn from SDK (`client.session.messages({path:{id}})`),
    appends one JSONL line in Segment shape to ~/.local/share/opencode/dolly/<escaped-cwd>/<sid>.jsonl,
    pipes {agent:"opencode", session, turn, turnStartMs, text, tools, files} to
    `dolly hook stop --from-stdin`. Per-session `seen` Map dedups idle refires.
- **transcript.ts** — SessionRef gains `kind: 'claude'|'opencode'`; listSessions merges
  claude projects dir + DOLLY_OPENCODE_DIR (~/.local/share/opencode/dolly); parseTranscript
  dispatches to parseOpencodeMirror for kind=opencode (JSONL of pre-shaped Segments).
- **cli.ts** — stdin auto-log payload gains optional `agent` field; source line and detail
  footer now name the harness instead of hardcoding "pi".
- **reindex.ts** — digest/spec wording de-Claude'd ("title:" not "title (from Claude Code):").

## Key discovery

opencode ≥1.x keeps sessions in SQLite (~/.local/share/opencode/opencode.db), no stable
JSONL on disk — file-based transcript parsing was a dead end. The plugin-side mirror is
the bridge: reindex reads what the plugin wrote, zero new dependencies.

## Gotchas for the next agent

- Plugin hook names are experimental-prefixed (`experimental.chat.system.transform`);
  wrap everything fail-soft — a plugin throw can break sessions.
- SDK response shape handled defensively: res.data array OR .messages; message as {info,parts}
  OR flat. Version drift tolerated.
- Mirror `index` = startIdx+1 where startIdx = message count seen — stable per turn,
  which is all the dedup key needs.
- Generated plugin escapes: inside the TS template literal, `\\n` produces `\n` in output;
  backticks in generated comments must be plain quotes or they leak as `\``.
<!-- /dolly:step 0003 -->

<!-- dolly:step 0004 -->
## 0004 · 2026-08-25T15:05:55Z · @nick.delirium

- task status: working
- files: `.opencode/commands/dolly-adopt.md`, `.opencode/commands/dolly-board.md`, `.opencode/commands/dolly-housekeep.md`, `.opencode/commands/dolly-plan.md`, `.opencode/commands/dolly-resume.md`, `.opencode/commands/dolly-spec.md`, `.opencode/commands/dolly-step.md`, `.opencode/commands/dolly-update.md`, `.opencode/commands/dolly-validate.md`, `.opencode/plugins/dolly.js`, `.opencode/skills/dolly-planning/SKILL.md`, `.opencode/skills/dolly/SKILL.md`, `AGENTS.md`, `README.md`, `commands/board.md`, `opencode.json`, `src/cli.ts`, `src/core/transcript.ts`, `src/install.ts`, `src/reindex.ts`, `tests/install.test.mjs`, `tests/transcript-opencode.test.mjs`

## Bug + fix

User report from opencode TUI: /dolly-board injected the board into the prompt AND
made the model narrate it back. Root cause: opencode command templates always submit
to the LLM — !`cmd` output is just prompt context, unlike what a display-only command
wants.

Mechanism found: `command.execute.before` hook can cancel the LLM call by throwing.
Pattern proven by opencode-shell-commands plugin (lucleray). Combined with
client.session.shell({path:{id}, body:{command, agent:"build"}}) to display real output
in the transcript.

Fix: commands may declare frontmatter `direct: true`; generated plugin scans
.opencode/commands + ~/.config/opencode/commands for dolly-*.md with that flag, grabs
the first !`cmd` line, substitutes $ARGUMENTS/${ARGUMENTS:-default}/$1..$9 in JS
(avoided ${ inside the TS template literal by building "${ARGUMENTS:-" as "$"+"{..."),
runs it via session.shell, throws to skip the LLM. If the shell route fails, plugin
stands down and normal prompt flow proceeds.

Only board.md got `direct: true`. Audited the other eight: adopt/housekeep/plan/resume/
spec/step/update/validate all instruct the agent to DO something after showing data —
LLM round-trip is their point. Claude Code ignores unknown frontmatter keys, so the
same file still installs cleanly for /dolly:board there.

Verified headless: `opencode run "/dolly-board"` prints the board as a shell result,
no assistant message follows.
<!-- /dolly:step 0004 -->
