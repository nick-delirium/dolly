<!-- dolly steps · task t26kjrsz · append-only, newest at the bottom -->
# Full step context — Agent footprint + hot-path latency audit

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001 -->
## 0001 · 2026-10-20T11:49:01Z · @nick-delirium

- task status: working
- files: `src/mcp.ts`, `src/core/render.ts`, `skills/dolly/SKILL.md`, `README.md`, `tests/mcp.test.mjs`, `tests/footprint.test.mjs`, `tests/cli-args.test.mjs`, `.claude/skills/dolly/SKILL.md`, `.opencode/skills/dolly/SKILL.md`

## Footprint + latency audit (on top of 3tx3c6t5's earlier pass)

### Measured (this repo, Claude Code)
| surface | when | before | after |
|---|---|---|---|
| MCP tool list | every session (full schemas in opencode/cursor/pi; Claude Code defers them — names only until searched) | 17 tools · 8987 B | 13 tools · 7444 B |
| MCP server instructions | every session | 237 B | 329 B (now defines `ref` once, names dolly_recall + dolly_plan) |
| instruction block | every session | 1652 B | unchanged — but loaded TWICE here (global ~/.claude/CLAUDE.md + project CLAUDE.md) |
| session-start | every session | 1539 B | unchanged (already lean) |
| skill body | when invoked | 8216 B | 7173 B |
| dolly context | every pickup | planned tasks −440..−925 B; zero-step --brief no longer bigger than full |

Latency (all fine, no change needed): bare node 19ms, `dolly version` 34ms, session-start 60ms, context 59ms, board 54ms, recall 78ms, plugin hook wrapper 23ms (dedup exit), **hook stop ~90ms on this session's 4.4MB / 1920-line transcript**.

### Changes
- mcp.ts: `REF` description was repeated in 11 tools (1331 B) → `Task ref; default current.`; the ref grammar lives once in the server instructions. 5 plan tools → one `dolly_plan` with `action` enum (start/check/set/qa/finalize), per-action required args checked in run (`set needs text`). `badArgs` now validates `enum`. reindex property text trimmed. `writesStore('dolly_plan')` = action ≠ check. Footprint assertion back to < 8000.
- render.ts: skip `## Spec (short)` when its first paragraph is verbatim inside the full spec (finalize derives it from Goal; createTask-only tasks have spec v1 = short). A short spec rewritten later doesn't match → shown. --brief footer only when live step bodies exist.
- SKILL.md: compaction section → 2 lines (the material prints its own rules); recall paragraph tightened. Synced .claude/, .opencode/ and ~/.claude/skills copies.
- Tests: new MCP test for the dolly_plan flow + enum rejection; two tests used the brief footer as a "read worked" signal on step-less tasks — now assert real signals.

### Not taken (and why)
- Log clip 500→300 chars: ~190 B/task average, loses real summaries.
- Project brief in context (3.2KB/pickup) also partly in session-start: kept — hosts without hooks (codex, cursor) only get it from context.
- Further MCP property trims: remaining text is already terse; diminishing returns.

### Recommendations for the human (config, not code)
- This repo has `install.mcp: true` and ~/.claude.json registers dolly MCP globally. Claude Code defers the schemas so it's cheap there; in hosts that don't defer, MCP costs 7.4KB/session for the same surface as the CLI. Default stays `false`.
- The instruction block is in both ~/.claude/CLAUDE.md and the committed project CLAUDE.md → 1.65KB twice per session in this repo. Project copy is for teammates; global is for other repos. Accept or drop the global one.
<!-- /dolly:step 0001 -->
