<!-- dolly steps · task 0004 · append-only, newest at the bottom -->
# Full step context — pi hook extension for auto-inject and auto-log

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001 -->
## 0001 · 2026-08-07T20:32:38Z · @rjshrjndrn

- task status: working
- files: `.gemini/settings.json`, `.pi/git-root.cache`, `.pi/memory.db`, `.pi/memory.db-shm`, `.pi/memory.db-wal`, `.pi/skills/dolly-planning/SKILL.md`, `.pi/skills/dolly/SKILL.md`, `.windsurf/rules/dolly.md`, `AGENTS.md`, `GEMINI.md`, `opencode.json`, `package-lock.json`, `src/cli.ts`, `src/install.ts`, `tests/hooks.test.mjs`, `tests/install.test.mjs`

## v1: pi auto-inject extension (before_agent_start)

dolly install (pi target, --global) now writes
~/.pi/agent/extensions/dolly.ts. On before_agent_start the extension
shells `dolly hook session-start --raw` and prepends the output to
event.systemPrompt, wrapped in try/catch so a missing binary/store
never blocks a pi session. Global-only (pi loads extensions from
~/.pi/agent/extensions; repo-local loading unconfirmed).

Extension is written UNTYPED (export default function(pi){...}, no
pi-coding-agent import) so it carries no dependency on the package
name — dodges the @earendil-works vs @mariozechner split. Test
asserts the body has no `pi-coding-agent` string.

### Bug caught by real data (why --raw exists)
`dolly hook session-start` emits Claude Code's hook envelope
{"hookSpecificOutput":{"additionalContext":"..."}}, NOT plain text.
The first extension prepended that JSON blob straight into pi's
prompt. pi does not speak Claude's hook protocol. Fix: added a
`--raw` mode to emitSessionStart (src/cli.ts) that writes the plain
additionalContext with no envelope; extension shells
`session-start --raw`. Keeps the "CLI is the brain" invariant — the
output-format branch lives in the CLI, the extension stays a shim.

Only discovered by running the command; the shape was invisible from
the install code. Lesson stands: nothing proven till run.

### TDD
RED first in both suites:
- tests/install.test.mjs: extension written on --global (real temp
  HOME), body shape (before_agent_start, session-start --raw, try,
  systemPrompt, no pi-coding-agent), idempotent rerun.
- tests/hooks.test.mjs: `session-start --raw` emits plain context,
  no hookSpecificOutput envelope.
Suite 94/94. Added a writeFileIdempotent helper (whole-file write
reporting up-to-date/wrote) since writeBlock only handles marker
blocks.

### Deferred (v2, its own task)
auto-LOG via turn_end, event-driven path (b): read
event.message+event.toolResults, feed `dolly step`. No transcript
parser needed — pi's event carries the data Claude's dataless Stop
hook never did.

Manual check for human: restart pi in this repo, confirm the dolly
context block appears at session start; rename the dolly bin and
confirm pi still starts clean (failure is swallowed).
<!-- /dolly:step 0001 -->

<!-- dolly:step 0002 -->
## 0002 · 2026-08-07T20:35:07Z · @rjshrjndrn

- task status: validating
- files: `src/install.ts`

## Validation evidence (both criteria met with data)

Load mechanism confirmed: pi auto-loads ~/.pi/agent/extensions/*.ts
(not just settings.json `packages`). Proof — acm.ts and
auto-session-name.ts live in that dir, are absent from packages[],
yet run; acm was active all session. `pi list` only lists packages[],
so a dropped extension file is invisible there but still loads.

Criterion 1 — auto-inject works (end-to-end, fresh session):
  $ pi -p "Without tools, quote the first 'dolly store:' line from
           your startup context, else NONE"
  → dolly store: /home/.../.dolly — planning 1 · validating 2 · done 1
A brand-new pi session received the injected context through the
extension. Not mocked.

Criterion 2 — failure swallowed:
  $ env PATH=/usr/bin:/bin pi -p "Reply PI_OK"
  → PI_OK
With dolly absent from PATH, execFileSync throws, the try/catch eats
it, the prompt is returned unchanged, pi boots clean.

Verification tools discovered: `pi -p/--print` (non-interactive, fires
before_agent_start) is the definitive check; `pi list` is NOT (shows
only packages[]). Mechanical pre-checks: file present in auto-load
dir + valid TS.

Human may set done.
<!-- /dolly:step 0002 -->

<!-- dolly:step 0003 -->
## 0003 · 2026-08-07T20:48:15Z · @rjshrjndrn

- task status: done
- files: `src/core/transcript.ts`

## Correction: pi auto-log is not a config tweak (evidence from code)

Earlier framing suggested DOLLY_TRANSCRIPT_DIR could point dolly at
pi's sessions and reuse the auto-log path. Wrong — verified in code:

1. src/core/transcript.ts:77 projectsRoot() — DOLLY_TRANSCRIPT_DIR
   overrides only the ROOT DIRECTORY. escapeCwd() (:82) still uses
   Claude's flattening (/[^a-zA-Z0-9]/g -> '-'); pi wraps cwd as
   --...-- so candidateDirs() would not even match pi's session dir.
2. The PARSE is schema-coupled to Claude: :206 o.type!=='user',
   isSidechain, isMeta; :207 message.content; :406 tool_use/tool_result;
   :345 ai-title. A pi line ({type:"message", id/parentId, ...}) fails
   every predicate -> 0 turns parsed.
3. The pi extension registers ONLY before_agent_start (inject). No
   turn_end/stop. No pi reindex path exists in src/. Nothing consumes
   a pi turn today; applyReindex assumes Claude-shaped turns.

So two mismatches, not one: LOCATION naming AND RECORD schema.
DOLLY_TRANSCRIPT_DIR fixes at most the location.

Implication for v2 (auto-log):
- Path (a) transcript adapter must close BOTH mismatches inside
  transcript.ts + a format selector + reindex turn-extraction that
  accepts pi's shape. Real work, second schema to maintain.
- Path (b) event-driven closes NEITHER: extension adds
  pi.on("turn_end"), reads event.message+event.toolResults in memory,
  pipes to a NEW `dolly hook stop --from-stdin` that builds a step from
  given turn json. No transcript, no parser. RECOMMENDED for pi — the
  only reason Claude needs transcript parsing is its Stop hook is
  dataless; pi's turn_end carries the turn.
<!-- /dolly:step 0003 -->

<!-- dolly:step 0004 -->
## 0004 · 2026-08-08T03:11:23Z · @rjshrjndrn

- task status: working
- files: `src/cli.ts`, `src/install.ts`
- source: pi session live-demo · turn live-demo:99

Smoke-test: event-driven auto-log wired end to end.

tools: edit, bash

_Auto-logged by the pi extension from the turn_end event, not written by a human. Correct it with a follow-up `dolly step` if it misleads._
<!-- /dolly:step 0004 -->

<!-- dolly:step 0005 -->
## 0005 · 2026-08-08T03:12:07Z · @rjshrjndrn

- task status: working
- files: `.gemini/settings.json`, `.pi/git-root.cache`, `.pi/memory.db`, `.pi/memory.db-shm`, `.pi/memory.db-wal`, `.windsurf/rules/dolly.md`, `AGENTS.md`, `GEMINI.md`, `opencode.json`, `package-lock.json`, `src/cli.ts`, `src/install.ts`, `tests/hooks.test.mjs`, `tests/install.test.mjs`

## v2 auto-log lands: event-driven, bypasses transcript.ts

Pulled auto-log forward into 0004 (spec bumped to v3, reason recorded).
Chose path (b) event-driven, not the transcript adapter (a).

### CLI: `dolly hook stop --from-stdin` (src/cli.ts)
New branch in the stop handler. Reads a turn as JSON on stdin
(readStdin, sync fs.readFileSync(0)), never a transcript file:
  { session, turn, turnStartMs?, text, tools[], files[] }
Rules, mirroring the Claude path where they apply:
- no active task -> no-op.
- gated by config.reindex.autoLog + autoLogOnlyWhenWorking.
- turnId = `<session>:<turn>`, written into the step source; a
  re-fired/replayed turn is skipped via importedTurns() dedup.
- skip-if-agent-logged: if turnStartMs given and task.updated >=
  turnStartMs, the agent logged during the turn -> skip (this is the
  stdin analogue of the Claude path's onlyNewerThan: active.updated).
- empty/garbage stdin -> return, never throws (execFileSync in the
  extension would otherwise surface a non-zero exit).
- always writes a detail so the source/dedup marker persists (addStep
  only records `source` when a detail exists).
Two small synthesizers: stopStdinSummary (first real line, capped 200,
else "Ran <tools>") and stopStdinDetail (text + tools + an
auto-logged provenance line).

### Extension (src/install.ts PI_EXTENSION)
Added turn_start (tracks turnStartMs in a module var) and turn_end.
turn_end reads event.message.content blocks: text -> summary/detail,
toolCall/tool_use -> tool names + files (arguments.path|file_path|
filePath), session id from ctx.sessionManager.getSessionId(). Pipes the
JSON to `dolly hook stop --from-stdin`. Whole thing in try/catch ->
never blocks a turn. Still untyped (no pi package import).

Types verified against installed pi 0.84.1:
TurnEndEvent { turnIndex, message: AssistantMessage, toolResults[] };
AssistantMessage.content = (TextContent|ThinkingContent|ToolCall)[];
ToolCall { type:"toolCall", name, arguments }.

### Why not the transcript adapter
transcript.ts is Claude-only in BOTH location-escaping and record
schema; pi's turn_end already carries the turn in memory, so re-reading
a file to reconstruct it would be pure debt. No parser, no second
schema.

### Proven with data
- 6 new stdin tests (append, dedup, autoLogOnlyWhenWorking, skip-if-
  agent-logged, garbage) + extension body asserts turn_end + stop
  --from-stdin. Suite 99/99.
- End-to-end smoke: piped a turn to the real dolly bin; a step landed
  on 0004. NOTE: the auto-logged line just above this step
  ("Smoke-test: event-driven auto-log wired end to end.", turn
  live-demo:99) is that TEST ARTIFACT, not real work — ignore it. Its
  existence is the proof the path works.

Next: human restart pi, do a real turn, confirm dolly auto-logs it
onto the active task.
<!-- /dolly:step 0005 -->

<!-- dolly:step 0006 -->
## 0006 · 2026-08-08T03:14:06Z · @rjshrjndrn

- task status: validating
- files: `src/install.ts`, `src/cli.ts`

## Auto-log validated with a live `pi -p` process

Created throwaway task 0005, set it working, ran:
  pi -p "Run the bash command: echo dolly-autolog-probe. Then tell me
         what it printed, in one sentence."

A real nested pi session executed a bash turn. The extension's
turn_end fired and piped each turn to `dolly hook stop --from-stdin`.
Two steps auto-logged onto 0005:
  - turn :0  "Ran bash."                      (tools-only summary synth)
  - turn :1  "It printed `dolly-autolog-probe`."
Both stamped with the real pi session id:
  source: pi session 019fdf5c-9ccd-7b19-b83c-845ac8f8f27d · turn ...:0 / :1

This is the full chain proven live: pi turn_end -> extension ->
execFileSync dolly hook stop --from-stdin -> addStep. Not a piped
mock. Confirms the tools-only summary path (turn with a toolCall but
no final text -> "Ran bash.") and the dedup key format.

Cleanup: 0005 archived to archive/2026-08. Board left with 0004
validating.
<!-- /dolly:step 0006 -->
