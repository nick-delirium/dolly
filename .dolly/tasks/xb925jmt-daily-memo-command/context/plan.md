<!-- dolly plan · created 2026-08-25T15:14:54Z · @nick.delirium -->
# Plan — Daily memo command

> Interview record. Every section below must be answered before `dolly plan finalize`.
> Gate: `dolly plan check` fails while a section is empty, `_TBD_`, or an Open Question is unchecked.

## Brief

dolly memo indexes what happened TODAY: reads all task updates/steps, the current chat log, and creates a short memo of the day describing what the user worked on, files changed, linking related tasks.

## Problem

End-of-day 'what did I do today?' requires manually piecing together task logs, chat history and git. User wants one command that indexes the day and produces a short linked memo.

## Goal

gathers everything that happened today — steps, status moves, spec changes across all tasks, plus chat turns from Claude Code and opencode transcripts and raw git activity — and prints a digest. The agent turns it into a short prose memo (what was worked on, files changed, related-task links) saved as .dolly/memo/YYYY-MM-DD.md, committed with the repo.

## Scope

In:
- dolly memo command: digest builder (today by default, --date YYYY-MM-DD)
- dolly memo --file <md> / stdin: save agent-written prose to .dolly/memo/<date>.md
- digest sources: task logs (all statuses), transcripts (claude + opencode mirror), git log/diffstat since midnight
- slash command /dolly-memo for claude + opencode
- config key memo.auto (default false): when true, session-start hook notes if no memo exists for today

Out:
- LLM calls from the CLI itself
- weekly/monthly rollups

## Success Criteria

- [ ] dolly memo prints a digest covering tasks + transcripts + git for today
- [ ] --date works for backfill; days with nothing report cleanly
- [ ] memo --file saves .dolly/memo/2026-08-25.md and it shows in board-era commands (?) and is git-committable
- [ ] /dolly-memo works in opencode and claude
- [ ] memo.auto=true surfaces a session-start hint when today has no memo
- [ ] npm test green

## Changes

Guesses marked (?).
- new src/core/memo.ts: date-window filtering of task events (parse Log sections), transcript segments via existing transcript.ts listSessions/parseTranscript filtered to window, git log --since
- cli.ts: memo command (+--json), config section memo {auto:boolean}
- templates/instructions.ts + skills: mention memo in the dolly skill
- commands/memo.md → installed as /dolly-memo for both agents
- cli.ts hook session-start: when memo.auto and no memo file for today, append one hint line
- tests/memo.test.mjs with fixture store + fixture transcripts

## Risks

- transcript windows rely on plugin mirrors being enabled; absent them, digest still covers tasks+git
- timezone: use local midnight (?); document
- digest size on heavy days: cap per-source sections like reindex does

## Test Plan

- unit: digest includes today's step/status/spec events and excludes yesterday's
- unit: transcript segments within window included
- unit: memo --file writes correct path, idempotent overwrite
- unit: memo.auto hint appears/clears in session-start output
- manual: run in this repo after a real day of work

## Open Questions

- [x] Where does the memo live? → .dolly/memo/YYYY-MM-DD.md, agent-written prose from mechanical digest (user)
- [x] Scope? → everything incl. untasked chats and raw git (user)
- [x] Trigger? → configurable auto or manual (user)

## Q&A

_none yet_
