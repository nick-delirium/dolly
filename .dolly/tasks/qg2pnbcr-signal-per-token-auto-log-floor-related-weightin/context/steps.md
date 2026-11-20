<!-- dolly steps · task qg2pnbcr · append-only, newest at the bottom -->
# Full step context — Signal per token: auto-log floor, related weighting, lean context

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001 -->
## 0001 · 2026-11-20T09:05:43Z · @nick-delirium

- task status: working
- files: `src/reindex.ts`, `src/cli.ts`, `src/install.ts`, `src/core/related.ts`, `src/core/render.ts`, `README.md`, `tests/hooks.test.mjs`, `tests/project.test.mjs`, `tests/footprint.test.mjs`

## What changed
- Auto-log floor: `ReindexOpts.onlyWithFiles` (reindex.ts selectSegments); the Stop hook's transcript path sets it → only turns that changed a project file get an auto-step. stdin path (pi/opencode/zcode): skip when the payload reports `files` as an array and it is empty; a payload with no `files` field at all (zcode Stop) keeps the old floor — it can't tell.
- pi extension (install.ts template) only counts files from write/edit/patch tools; it used to count every tool's `path`, so reads looked like work. opencode plugin already did this. Users must re-run `dolly install pi` to get the new extension.
- `--auto-files` warns on stderr when > 30 changed files (NOISY_TREE): each recorded file links the task to every other task that touched it.
- related.ts: score = Σ idf(shared file) × 1/sqrt(max(1, |task files|/10)); idf = ln(1 + N/df) over tasks that recorded files. `hubOnly` = every shared file is touched by > 25% of tasks (only when ≥ 8 tasks have files). `relatedToTask` (used by context) drops hubOnly; explicit `related --files` keeps them (you asked about that file) but ranks them last. `shared` sorted rarest first.
- context: CONTEXT_BRIEF is Invariants + Conventions (Overview dropped — session start injects it and re-injects after compaction). `--brief`: no project brief, short spec instead of full spec, 2 related, 10 log entries. 27cnrmhh brief 13.4KB → 4.8KB.

## Gotcha found
tests/hooks.test.mjs transcript fixture recorded `cwd: '/unused'`, so its Edit targets were "outside the project" and never counted as files — invisible until the floor depended on files. plantTranscript now rewrites cwd to the real project dir.

## Not done
Full context is still ~18KB on 27cnrmhh (full spec 5.9KB + one 5KB step body). That's the "about to write code" read; left alone.
<!-- /dolly:step 0001 -->

<!-- dolly:step 0002-nick-delirium -->
## 0002 · 2026-11-20T09:56:07Z · @nick-delirium

- task status: validating
- files: `src/cli.ts`, `src/core/render.ts`, `plugins/opencode.js`, `tests/footprint.test.mjs`, `tests/opencode-plugin.test.mjs`

Measured defaults: instruction block 1.66KB, skill descriptions ~260B each, session start ~1.9KB, context --brief 4.8–5.4KB, full context ~18.5KB typical / 30–35KB on the two longest tasks (6mq9hmg4, v94p7gqv: 10KB planned spec + three 4–5KB step bodies — left alone, it is the why-read; dolly compact is the tool when it hurts), recall ≤3KB, MCP tool list 7.7KB only with --mcp. opencode: the old plugin re-read session-start every 30s and on every user turn; the text has clock-relative parts (updated Nm ago), so the system prompt changed per turn and busted provider prompt caching.
<!-- /dolly:step 0002-nick-delirium -->
