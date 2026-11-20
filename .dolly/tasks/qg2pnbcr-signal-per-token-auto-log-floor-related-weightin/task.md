---
id: qg2pnbcr
slug: signal-per-token-auto-log-floor-related-weightin
title: "Signal per token: auto-log floor, related weighting, lean context"
status: done
owner: nick-delirium
collaborators: [nick-delirium]
tags: [footprint]
steps: 2
spec_version: 1
created: 2026-11-20T08:56:35Z
updated: 2026-11-20T10:00:12Z
sessions: [36d7b4d9-0ca0-4cb9-8bd0-8b3723565119]
---

# qg2pnbcr · Signal per token: auto-log floor, related weighting, lean context

<!-- dolly:header -->
`done` · spec v1 · @nick-delirium · 2 steps · updated 2026-11-20 10:00Z
<!-- /dolly:header -->

## Spec

Auto-log only turns that changed project files; --auto-files warns on noisy trees; related ranks tasks by how rare the shared files are (task.ts matches 9/25 tasks today); context drops the Overview session start already injects and --brief drops the project brief entirely.

## Success Criteria

- [ ] a turn that changed no project files is not auto-logged
- [ ] related/why rank by file rarity; a task sharing only hub files ranks below one sharing a rare file
- [ ] context --brief on 27cnrmhh is at least 40% smaller than today's 13.4KB
- [ ] footprint tests green

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-11-20 09:02Z` @nick-delirium: status todo → working.
- `2026-11-20 09:05Z` @nick-delirium: Auto-log now skips turns that changed no project file (pi stops counting reads as files); related ranks by file rarity and context drops hub-only overlap; context --brief is the short read (13.4KB → 4.8KB on 27cnrmhh), full context no longer repeats the Overview.
  files: `src/reindex.ts`, `src/cli.ts`, `src/install.ts`, `src/core/related.ts`, `src/core/render.ts`, `README.md` +3 more · full: `steps.md#0001`
- `2026-11-20 09:05Z` @nick-delirium: status working → validating. dolly context 27cnrmhh --brief is ~4.8KB; dolly related --files src/core/task.ts ranks; next Claude Code turn that only answers a question leaves no auto-step. Re-run dolly install pi to refresh the pi extension.
- `2026-11-20 09:56Z` @nick-delirium: Final footprint pass: session start's 'Last:' now carries the newest step's outcome (was a files trailer); why on a hub file shows the 6 newest tasks and counts the rest (cli.ts 12.8KB → 3.8KB); the opencode plugin holds the injected context steady per session (re-read only after compaction) so the system prompt stays cacheable, and passes the session id so it names this conversation's task.
  files: `src/cli.ts`, `src/core/render.ts`, `plugins/opencode.js`, `tests/footprint.test.mjs`, `tests/opencode-plugin.test.mjs` · full: `steps.md#0002-nick-delirium`
- `2026-11-20 10:00Z` @nick-delirium: status validating → done. Reviewed: built and tested this session (362 tests green).

