<!-- dolly steps · task tc4bj56j · append-only, newest at the bottom -->
# Full step context — opencode: attach tasks via OPENCODE_SESSION_ID so turns auto-log

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001-nick.delirium -->
## 0001 · 2026-11-25T22:36:16Z · @nick.delirium

- task status: working
- files: `src/core/session.ts`, `src/cli.ts`, `tests/autolog-target.test.mjs`, `tests/helpers.mjs`

## Root cause
opencode exports OPENCODE_SESSION_ID (ses_…) to every shell its agent runs, but currentSessionId() only read DOLLY_/DOLLIE_/CLAUDE_CODE_/CLAUDE_SESSION_ID. So `dolly new`/`status`/`step` run by an opencode agent never attached the task to the session, and `dolly hook stop --from-stdin` (fed by the opencode plugin with the same ses_ id) found no sessionTask and returned silently. Session-start injection was unaffected (it falls back to most-recent open task).

## Decisions
- OPENCODE_SESSION_ID is checked after DOLLY_* and before CLAUDE_*: opencode launched from a Claude Code terminal inherits CLAUDE_CODE_SESSION_ID, and the innermost harness owns the command. The reverse nesting (claude inside opencode's terminal) would mis-attribute; accepted as rarer.
- `dolly continue` previously hard-coded `claude --resume`; with ses_ ids now attached it would print a broken command. resumeCommand/cmdContinue now launch `opencode --session <id>` for ses_ ids (isOpencodeSession). opencode's TUI has no fork, so `--fork` on an opencode session fails with a hint to `opencode run --session <id> --fork`.
- tests/helpers.mjs sandbox also clears OPENCODE_SESSION_ID and CLAUDE_SESSION_ID so tests run from inside an agent don't inherit it.

## Verified
- 2 new tests in tests/autolog-target.test.mjs; both fail on the old code, pass on the new. Full suite 365/365.
- Real opencode 2.4.1 run: agent's `dolly new` attached ses_…; after `status working`, an edit turn was auto-logged; `dolly continue --print` printed `opencode --session ses_…`.

## Open
- `dolly status current working` on a fresh todo task does not resolve `current` even when the task is attached to this session — agents following the instructions hit it.
<!-- /dolly:step 0001-nick.delirium -->
