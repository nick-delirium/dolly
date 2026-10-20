---
id: 27cnrmhh
slug: search-task-memory-recall-why-backlinks
title: "Search task memory: recall, why, backlinks"
status: validating
owner: nick-delirium
collaborators: [nick-delirium]
tags: []
steps: 1
spec_version: 2
created: 2026-10-20T10:39:40Z
updated: 2026-10-20T11:06:56Z
sessions: [30490afd-79ca-44be-91bb-1f8b86dff17b]
---

# 27cnrmhh · Search task memory: recall, why, backlinks

<!-- dolly:header -->
`validating` · spec v2 · @nick-delirium · 1 step · updated 2026-10-20 11:06Z
<!-- /dolly:header -->

## Spec

`dolly recall <words>` returns ranked, size-capped hits from every prose surface of the store — and with `--all-projects` every store dolly knows — each hit a task, a kind, a snippet and a `path:line` the agent can open directly. `dolly why <file>` answers "who changed this and why" from recorded files, prose mentions and git history. Tasks that mention another task's id show up as "Mentioned by" on it. All of it derived on demand from the markdown; nothing new is stored and no database exists. Agents reach it through the CLI and a `dolly_recall` MCP tool.

Out of scope: any database, persistent index or cache (a derived gitignored cache stays the escape hatch, not built now); embeddings / semantic search — needs a model; installing git hooks for the trailer — guidance only; boolean query language beyond words and quoted phrases.

Full spec: `context/spec.md` · plan: `context/plan.md`

## Success Criteria

- [ ] in this repo `dolly recall lock` ranks rqdpztdy step 0001 in the top 3
- [ ] every hit's `path:line` names an existing file and that line contains a query term (asserted over every hit in a test)
- [ ] `--kind`, `--status`, `--since`, `--task`, `-n` filter as documented (one test each)
- [ ] `--all-projects` returns hits from two stores in an isolated DOLLY_HOME, each labelled with its project; a dead index entry is skipped, not an error
- [ ] typo "compactoin" finds units containing "compaction", marked fuzzy
- [ ] default text output ≤ 3000 bytes for any query; `--json` carries every hit
- [ ] 1000 synthetic tasks: one recall < 2s on a dev machine (perf test with that bound)
- [ ] `dolly why <file>` lists the tasks that recorded it with their summaries, and commits touching it resolved to tasks by trailer
- [ ] `show`/`context` list "Mentioned by"; a task mentioning its own id is not its own backlink
- [ ] `dolly_recall` works over MCP; tool list < 9000 bytes; footprint tests green
- [ ] zero new runtime deps; npm test green

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-10-20 10:47Z` @nick-delirium: spec → v2. planning finished — spec derived from plan.md
  previous version kept in `spec.md`

### plan finalized · 2026-10-20 10:47Z · @nick-delirium

Plan complete. Status → todo.

- plan: `context/plan.md`
- `2026-10-20 10:52Z` @nick-delirium: status todo → working.
- `2026-10-20 11:06Z` @nick-delirium: dolly recall (BM25 over every note/spec/plan answer/memo/brief, path:line hits, --kind decision, filters, --all-projects, typo correction), dolly why <file>, Mentioned-by backlinks, body-aware duplicate warning, and dolly_recall over MCP — 400ms on 1000 tasks.
  files: `src/core/recall.ts`, `src/core/render.ts`, `src/core/related.ts`, `src/core/git.ts`, `src/cli.ts`, `src/mcp.ts` +9 more · full: `steps.md#0001`
- `2026-10-20 11:06Z` @nick-delirium: status working → validating. npm test (301). In this repo: dolly recall lock; dolly recall --kind decision mysql; dolly recall compactoin (typo); dolly why src/core/lock.ts; dolly show rqdpztdy (Mentioned by); dolly recall zebra --all-projects. Check: hits open at the printed line; text output feels right-sized. JSON caps at 100 hits (spec said every hit).

