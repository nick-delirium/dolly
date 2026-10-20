<!-- dolly spec · task 27cnrmhh -->
# Spec — Search task memory: recall, why, backlinks

**current: v2** · updated 2026-10-20T10:47:36Z by @nick-delirium · superseded versions are kept at the bottom of this file

<!-- dolly:spec-current -->
<!-- v2 · 2026-10-20T10:47:36Z · @nick-delirium -->

# Search task memory: recall, why, backlinks

## Problem

Agents re-derive decisions that already sit in step prose. The only ways into the store today are titles (fuzzy ref), recorded files (`dolly related`) and title-word overlap on `dolly new` — nothing searches the notes, specs, plan interviews or memos, which is where decisions live. `dolly context` shows the last 3 step bodies only, and the store is never pruned (2rhqyc8c), so older material is reachable only by hand-grepping markdown. Nothing searches across projects. User: "I want agents to be able to search up by keywords like 'recall summary' … then present relevant files so agent can search certain features, decisions etc."

## Goal

`dolly recall <words>` returns ranked, size-capped hits from every prose surface of the store — and with `--all-projects` every store dolly knows — each hit a task, a kind, a snippet and a `path:line` the agent can open directly. `dolly why <file>` answers "who changed this and why" from recorded files, prose mentions and git history. Tasks that mention another task's id show up as "Mentioned by" on it. All of it derived on demand from the markdown; nothing new is stored and no database exists. Agents reach it through the CLI and a `dolly_recall` MCP tool.

## Scope

**In:**
- `core/recall.ts`: corpus of units — task title + short spec, each log line (with its files), each step block split at its sub-headings, compacted step blocks (lower weight, once compaction lands), current spec, superseded spec versions (x0.5), plan sections + Q&A pairs, memo days, project.md sections, digests
- ranking: hand-rolled BM25, field weights (title > heading > body), boost when a query word matches a recorded file path, mild recency decay, "quoted phrase" bonus, light suffix stemming, `STOP` words shared with related.ts, fuzzy vocabulary fallback for terms with zero hits (flagged)
- `dolly recall <words...> [--kind step,spec,plan,log,memo,project,digest,decision] [--status s] [--since 30d|YYYY-MM-DD] [--task ref] [-n N] [--all-projects] [--json]`
- `--kind decision`: units under headings like Decisions / Dead ends / Rejected / Why, and plan Q&A
- `dolly why <file> [--json]`: tasks that recorded the file with the step summaries that did, prose hits naming it, `git log` commits for it mapped to tasks via a `Dolly-Task:` trailer or an id in the message
- backlinks: tasks whose prose contains another task's id (known ids only, whole word, self excluded) → "Mentioned by" in `show` and `context`
- `dolly new` duplicate check uses recall over title + short spec instead of title-word overlap
- MCP `dolly_recall`; asserted tool budget 8000 → 9000 bytes
- skill + instruction block line + README; skill recommends the `Dolly-Task: <id>` commit trailer

**Out:**
- any database, persistent index or cache (a derived gitignored cache stays the escape hatch, not built now)
- embeddings / semantic search — needs a model
- installing git hooks for the trailer — guidance only
- boolean query language beyond words and quoted phrases

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

## Changes

- `src/core/recall.ts` (new) — corpus, tokenizer/stemmer, BM25, snippets with line numbers, `recall(stores, query, opts)`
- `src/core/related.ts` — `mentionedBy(store, task)` backlinks; `why` assembly (or `src/core/why.ts`)
- `src/core/git.ts` — `fileLog(project, file)` commits with subject + trailers
- `src/core/render.ts` — `renderRecall`, `renderWhy`, "Mentioned by" in `renderShow`/`renderContext`
- `src/cli.ts` — `recall`, `why` commands, FLAGS, help, `new` overlap swap
- `src/mcp.ts` — `dolly_recall`
- `src/templates/instructions.ts`, `skills/dolly/SKILL.md`, `README.md`
- `tests/recall.test.mjs`, `tests/why.test.mjs`, `tests/footprint.test.mjs` budget 9000

## Risks

- Stale line numbers → computed from the file as read at query time, never cached.
- Slow on large stores (every query reads every markdown file) → perf test bounds it; a derived cache under `.local/` is the fallback if it ever fails.
- Noisy hits on common words → stopwords + idf + minimum score; snippet shows why it matched.
- Output blowup in an agent context → per-snippet clip and total cap in text mode.
- `--all-projects` reads a store written by a newer dolly or with a broken file → per-store try/catch, reported as skipped; recall never writes.
- Id false positives in backlinks → match only ids of existing tasks, as whole words.

## Test Plan

- Unit: tokenizer keeps file paths whole, stems plurals/-ing/-ed; rarer term outranks common one; title hit outranks body hit; superseded spec ranks under current; snippet line numbers; fuzzy fallback; decision-kind selection.
- Integration (CLI on tmp stores): each filter; `--json` shape; `--all-projects` with isolated DOLLY_HOME and a dead entry; `why` against a tmp git repo with a trailer commit; backlinks in show/context; MCP `tools/call dolly_recall`; `new` overlap hint from body text.
- Perf: 1000 synthetic tasks, recall < 2s.
- Manual: in this repo `dolly recall lock`, `dolly recall "auto log"`, `dolly recall --kind decision mysql`, `dolly why src/core/lock.ts`.

## Open Questions

- [x] Database for memory? → no, markdown stays the source of truth (Q&A)
- [x] MCP budget? → raise to 9000 bytes (Q&A)

## Decisions (from planning Q&A)

**Q (2026-10-20 10:42Z):** MCP tool budget (7549/8000 used)?

**A:** Raise the asserted budget to 9KB; add dolly_recall as its own tool.

**Q (2026-10-20 10:42Z):** Use a database (MySQL/SQLite) for memory storage and querying?

**A:** No. Markdown in git stays the source of truth (branch-local memory, PR-reviewable, offline, zero deps). Recall scans markdown on demand; a derived gitignored cache is the escape hatch if scale ever needs it. Cross-project via ~/.dolly/projects/index.json.
<!-- /dolly:spec-current -->

---

## Superseded versions

<!-- dolly:spec-history -->
## v1 — 2026-10-20T10:39:40Z · @nick-delirium

> superseded by v2: planning finished — spec derived from plan.md

# Search task memory: recall, why, backlinks

_Spec is being written by the planning interview. See `plan.md`._
<!-- /dolly:spec-history -->
