<!-- dolly steps · task 27cnrmhh · append-only, newest at the bottom -->
# Full step context — Search task memory: recall, why, backlinks

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001 -->
## 0001 · 2026-10-20T11:06:56Z · @nick-delirium

- task status: working
- files: `src/core/recall.ts`, `src/core/render.ts`, `src/core/related.ts`, `src/core/git.ts`, `src/cli.ts`, `src/mcp.ts`, `src/templates/instructions.ts`, `skills/dolly/SKILL.md`, `README.md`, `tests/recall.test.mjs`, `tests/footprint.test.mjs`, `CLAUDE.md`, `AGENTS.md`, `.claude/skills/dolly/SKILL.md`, `.opencode/skills/dolly/SKILL.md`

## Recall, why, backlinks — whole task, one slice

### What exists now
- `src/core/recall.ts` — corpus + ranking + `recall()`, `knownStores()`, `mentionedBy()`, `why()`, `similarTasks()`, `parseSince()`.
  - Units: task.md title+Spec / Success Criteria sections (kind task), each Log entry (kind log, with its files + stamp), steps.md blocks split at headings (kind step; label `step NNNN`; `rollup NNNN` markers already understood for compaction), spec current + superseded (`## vN — ` in spec-history, weight 0.5), plan sections + one unit per Q&A pair (decision=true), project.md sections, memo/*.md.
  - Long sections (>14 lines) are cut at blank lines / bullet starts (`paragraphs()`): one 40-line step note was otherwise buried by BM25 length normalisation under short sections that merely named the word (rqdpztdy step 0001 fell out of the top 8 for "lock" before this).
  - Step block metadata (`## NNNN · stamp`, `- task status:`, `- files:`, `- source:`) is stripped from the text; the block's files are attached to its FIRST unit only (otherwise every section of a note matched a file query).
  - Auto-log noise sections skipped: Work chain / Commands run / Tools.
- Ranking: BM25 (k1 1.2, b .75), heading tokens counted twice, coverage factor 0.4+0.6×(groups hit/groups), phrase ×1.5, query word in task title ×1.15, recency ≤ +15% (60-day decay), unit weight. idf over the whole corpus; filters apply after scoring.
- Query: each typed word is a group. Plain word → its stem. Path (`a/b/c.ts`) → whole 1, basename 0.8, bare name 0.3 — directory parts never ("src", "core", "ts" are in every step). Dotted/hyphenated compound → whole 1, parts 0.5.
- Typos: a group with zero df is corrected by OSA edit distance (≤1, ≤2 for 8+ chars) over the corpus vocabulary, closest then most common; reported in `fuzzy`. fzy subsequence (fuzzy.ts) cannot do this — "compactoin" is not a subsequence of "compaction".
- Snippet: best line in the unit by weighted group hits (so the line naming `src/core/lock.ts` beats one saying "lock"), clipped to 160 chars around the first hit; built lazily only for shown hits.
- Perf: 1000 tasks / 11.5MB → ~400ms. Two wins: lazy snippets (900→530ms), ASCII fast-path regex per line (530→400ms; the \p{L} classes cost ~2x).

### CLI / MCP
- `dolly recall <words…> [--kind k,..] [--status s] [--since 30d|2w|6m|date] [--task ref] [-n N] [--all-projects] [--json]`. A quoted multi-word shell arg becomes a phrase. Text: 8 hits, capped to 3000 bytes (whole hits dropped from the end, "+N more hidden"); `-n` disables the cap. JSON: up to 100.
- `--all-projects`: `~/.dolly/projects/index.json` via `knownStores()`; gone/unreadable stores are skipped and counted on stderr (index here holds ~100 dead test entries — see m6x2876y).
- `dolly why <file>`: steps whose log line OR full step block lists the file (log lines cap at 6 files; `parseLog` now captures `ref` from `full: steps.md#NNNN` to join them); `git log --follow` (new `fileLog` in git.ts) mapped to tasks by `Dolly-Task:` trailer or any known id in the message; prose naming the basename (files-only matches excluded).
- Backlinks: `mentionedBy()` — known id as a whole word in another task's task/steps/spec/plan; shown in `show` (CLI + MCP) and as `## Mentioned by other tasks` in `context`.
- `dolly new` / `plan start` overlap warning now also lists `similarTasks()` — tasks whose prose covers ≥60% (min 2) of the title's words.
- MCP `dolly_recall`; tool list 8346 bytes, budget assertion 8000 → 9000 (user's call). Agent block 1652 bytes (+1 sentence). Skill: recall/why lines, `Dolly-Task:` trailer + `### Decisions` heading convention. README section "Recall: search what was written". Synced the repo's installed copies (.claude/skills, .opencode/skills, CLAUDE.md, AGENTS.md block).

### Gotchas
- `DECISION_HEADING` first had `\bdecision\b` — never matched "Decisions". Fixed (`decisions?`); test now asserts both Decisions and Dead ends.
- An env-pinned store (DOLLY_DIR) takes its project from cwd's repo — in-process tests must `Store.open(sb.dir)` for `why`'s git lookups.

### Deviation from spec
- `--json` carries up to 100 hits (not literally every hit) — a common word matches tens of thousands of units.
- STOP list is recall's own (function words only); related.ts keeps its title list where "add"/"fix" are noise.

### Next
- Compaction (29kmjsgt) must add `steps.compacted.md` (weight <1 via `stepUnits(..., weight)`) and digests to `storeUnits`, and RecallKind `digest`.
<!-- /dolly:step 0001 -->
