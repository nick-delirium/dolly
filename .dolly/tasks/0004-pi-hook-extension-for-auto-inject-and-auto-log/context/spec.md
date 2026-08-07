<!-- dolly spec · task 0004 -->
# Spec — pi hook extension for auto-inject and auto-log

**current: v2** · updated 2026-08-07T20:27:25Z by @rjshrjndrn · superseded versions are kept at the bottom of this file

<!-- dolly:spec-current -->
<!-- v2 · 2026-08-07T20:27:25Z · @rjshrjndrn -->

# pi hook extension for auto-inject and auto-log

## Problem

dolly is ambient on Claude only: SessionStart/Stop hooks auto-inject task context and auto-log a step per turn. Every other agent (codex, cursor, opencode, pi) gets instructions+MCP and must be driven manually. We develop dolly in pi, yet pi starts every session blind and records nothing unless the agent remembers to call `dolly context`/`dolly step`. There is no per-harness automation seam — Claude's hooks are the only ambient integration and the only transcript parser.

## Goal

Give pi the auto-INJECT half of Claude's ambient behavior: a pi extension that dolly install writes to ~/.pi/agent/extensions/dolly.ts, which on before_agent_start shells `dolly hook session-start` and prepends its output to the system prompt. Every pi session then opens already knowing the active task's spec, criteria, and recent steps — zero agent effort. Auto-log is explicitly deferred to a follow-up.

## Scope

In:
- New extension template written by dolly install pi target → ~/.pi/agent/extensions/dolly.ts (global).
- Extension: export default function(pi){ pi.on('before_agent_start', e => ({systemPrompt: e.systemPrompt + '\n\n' + <dolly hook session-start stdout>})) }. Untyped/inline-typed to avoid the package-name split. execFileSync('dolly',['hook','session-start'],{cwd, timeout, encoding}); try/catch → no-op on any failure.
- Idempotent write (skip if present/current), matching install conventions.
- Tests for the pi target emitting the extension + its content shape.

Out:
- Auto-LOG (turn_end → step). Separate task; will use event-driven path (b): read event.message+event.toolResults, feed `dolly step`, no transcript parser.
- Repo-local extension install.
- Any change to `dolly hook session-start` itself (already agent-agnostic — reads .dolly, no transcript).
- A generic TranscriptParser abstraction (only needed if auto-log path (a) is ever chosen).

## Success Criteria

- [ ] `dolly install pi --global` writes ~/.pi/agent/extensions/dolly.ts.
- [ ] The extension registers a before_agent_start handler that shells `dolly hook session-start` and appends stdout to systemPrompt.
- [ ] Extension has no hard dependency on a specific pi package name (untyped or inline type).
- [ ] Failure of the dolly command (absent binary, no store) is swallowed — the turn is never blocked and systemPrompt is returned unchanged.
- [ ] Re-running install is idempotent (up-to-date, no duplicate/overwrite churn).
- [ ] Manual: restart pi in this repo, confirm the injected dolly context block appears at session start.
- [ ] Unit tests green via `make test`.

## Changes

- src/install.ts — pi target gains an extension write (global scope): copy/emit extensions/dolly.ts. [primary]
- src/templates/ — new template string for the extension body (or inline in install.ts). [new]
- tests/install.test.mjs — pi target writes the extension (global dry-run path + content asserts before_agent_start + 'dolly hook session-start'). [test]
- No change to src/cli.ts hook handlers; `dolly hook session-start` already agent-agnostic.

## Risks

- pi extension API drift: before_agent_start return shape ({systemPrompt}) is verified against installed pi 0.84.1 (auto-session-name.ts uses exactly this). Could change across pi versions. Low: shim is tiny, easy to regenerate.
- Package-name split (@earendil-works vs @mariozechner): mitigated by not importing the type at all.
- session-start latency added to every pi startup (execFileSync + timeout). Bounded by timeout; no-op fast when no store.
- Global-only write assumes ~/.pi/agent exists; guarded by the pi target's detect.
- pi may transpile .ts differently than assumed; verify the emitted file actually loads (manual criterion).

## Test Plan

Unit (make test):
- install pi --global (dry-run) lists ~/.pi/agent/extensions/dolly.ts among outputs.
- install pi (real, temp HOME) writes the extension file; content matches /before_agent_start/ and /dolly hook session-start/.
- extension body contains a try/catch and returns event.systemPrompt unchanged on failure (assert source text).
- second install run reports up-to-date (idempotent).
Manual:
- dolly install pi --global; restart pi in this repo; confirm the dolly context block is injected at session start; break it (rename dolly bin) and confirm pi still starts cleanly.

## Open Questions

- [x] pi event/return shape for injection? → before_agent_start returns {systemPrompt: e.systemPrompt + text} (verified live).
- [x] Reimplement inject logic? → no, shell existing `dolly hook session-start`.
- [x] Session-id / transcript-dir seams? → DOLLY_SESSION_ID + DOLLY_TRANSCRIPT_DIR env already honored (only matters for auto-log v2).
- [x] Does auto-log's parser handle pi? → no; deferred, will use event-driven path (b), no parser abstraction needed.
- [x] Import/package-name resolution? → type-only import; write untyped to avoid @earendil-works vs @mariozechner split.
- [x] Install scope? → global ~/.pi/agent/extensions/dolly.ts.
- [x] Auto-log phasing? → separate follow-up task; 0004 is inject-only.

## Decisions (from planning Q&A)

**Q (2026-08-07 20:19Z):** How does pi expose the two events dolly needs?

**A:** before_agent_start: handler returns {systemPrompt: event.systemPrompt + text} to inject context (proven in auto-session-name.ts). turn_end: async handler fires per finished turn (used in acm.ts). Extension shape: export default function(pi: ExtensionAPI){ pi.on(...) }, import from @earendil-works/pi-coding-agent.

**Q (2026-08-07 20:19Z):** Do we reimplement inject/auto-log logic in the extension?

**A:** No. The heavy logic already lives in the CLI: `dolly hook session-start` (emits capped context) and `dolly hook stop` (parses transcript, applyReindex auto-log, session-pinned). Extension is a thin shim: execFileSync('dolly',['hook','session-start'|'stop']) from node:child_process, wrapped in try/catch so it never blocks a turn.

**Q (2026-08-07 20:19Z):** What's the known risk?

**A:** Session-id pinning: `dolly hook stop` on Claude pins to currentSessionId() so two Claude sessions in one repo don't cross-log. pi's cwd-based shell call may not expose the same id → two pi sessions could auto-log onto the wrong task. Must thread pi's session id (ctx.sessionManager.getSessionDir/id) into the stop call.

**Q (2026-08-07 20:21Z):** Session-id pinning — how bad is the risk?

**A:** Solved by existing env seam. currentSessionId() already honors DOLLY_SESSION_ID (src/core/session.ts). Extension sets DOLLY_SESSION_ID=<pi session id> when shelling — no CLI change. Same for transcript dir: projectsRoot() honors DOLLY_TRANSCRIPT_DIR.

**Q (2026-08-07 20:21Z):** Does dolly's auto-log parse pi transcripts?

**A:** NO. Blocking finding. src/core/transcript.ts is hardwired to Claude Code JSONL schema (type==='user'/'assistant', message.content, tool_result, isSidechain, ~/.claude/projects/<escaped-cwd>/<session-id>.jsonl). pi JSONL is a different schema entirely (type: session/message/model_change/custom; id/parentId; ~/.pi/agent/sessions/<escaped>/<ts>_<uuid>.jsonl). So `dolly hook stop` auto-log will NOT work for pi as-is. Auto-inject (session-start) needs no transcript and works today.

**Q (2026-08-07 20:21Z):** Two implementation paths for pi auto-log?

**A:** (a) pi-transcript adapter: teach src/core/transcript.ts + reindex to parse pi JSONL, selected via env/flag. Reuses applyReindex, keeps CLI as the brain, but real parsing work + a second schema to maintain. (b) event-driven: pi turn_end hands the extension event.message + event.toolResults directly (seen in acm.ts); extension calls `dolly step` with that content, bypassing transcript parsing. Less dolly change, but duplicates summary logic in the extension and diverges from the Claude path.

**Q (2026-08-07 20:26Z):** Is there a per-harness transcript parser interface? How are codex/opencode/others automated?

**A:** No interface. mergeHooks is called ONLY inside the claude target. codex/cursor/windsurf/copilot/gemini/opencode/agents get instructions(AGENT_BLOCK)+MCP only — NO hooks, NO auto-inject, NO auto-log. They stay in sync manually: AGENT_BLOCK instructs the agent to call dolly context/step itself. Claude is the ONLY ambient integration, so there is exactly one transcript parser (Claude schema), hardwired, no plugin seam. pi would be the SECOND ambient harness dolly has ever had.

**Q (2026-08-07 20:26Z):** Given no parser interface, which auto-log path fits pi?

**A:** Path (b) event-driven is the natural fit, not a hack. Claude's Stop hook is DATALESS — it only signals 'a turn ended', forcing dolly to re-read the transcript file to discover what happened; that is the ONLY reason the parser exists. pi's turn_end event CARRIES event.message + event.toolResults directly. Re-reading a transcript to reconstruct data the event already handed us would be pointless. So for pi: extension reads turn_end payload → calls `dolly step` (or a new `dolly hook stop --stdin` fed the turn json). No transcript, no pi parser, no new abstraction. Path (a) pi-transcript adapter only worth it if we expect a 3rd/4th ambient harness that also gives dataless hooks.

**Q (2026-08-07 20:26Z):** Phasing decision?

**A:** Two phases. v1 (this task 0004): auto-INJECT only via before_agent_start shelling `dolly hook session-start` — reads .dolly store, no transcript, works today, delivers most daily value (no blind session starts). v2 (separate later task): auto-LOG via event-driven path (b). Keeps 0004 small and unblocked.

**Q (2026-08-07 20:26Z):** Import resolution + package name?

**A:** pi loads/transpiles .ts extensions itself; there is no package.json/node_modules/tsconfig in ~/.pi/agent, so pi resolves bare imports against its own install (currently @earendil-works/pi-coding-agent v0.84.1; @mariozechner/pi-coding-agent is an older alias, both present in the wild). Risk: hardcoding either import name is fragile. Mitigation: the inject shim only needs pi.on(...) + execFileSync; ExtensionAPI is a TYPE-only import. Write the extension untyped (export default function(pi){...}) or with a minimal inline type → zero package dependency, immune to the name split.

**Q (2026-08-07 20:26Z):** Extension install scope — global vs repo-local?

**A:** DECIDE global: ~/.pi/agent/extensions/dolly.ts. Consistent with how the dolly hooks are user-global for Claude, and pi's own extensions (acm, auto-session-name) live global. Repo-local extension loading unconfirmed; not needed for v1.
<!-- /dolly:spec-current -->

---

## Superseded versions

<!-- dolly:spec-history -->
## v1 — 2026-08-07T20:19:39Z · @rjshrjndrn

> superseded by v2: planning finished — spec derived from plan.md

# pi hook extension for auto-inject and auto-log

_Spec is being written by the planning interview. See `plan.md`._
<!-- /dolly:spec-history -->
