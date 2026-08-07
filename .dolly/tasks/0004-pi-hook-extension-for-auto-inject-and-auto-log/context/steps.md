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
