<!-- dolly:instructions -->
## dolly — long-term memory + planning

Task memory live in `.dolly/` (git-tracked, shared with teammates). You write it. Never guess state — read it.

**One repo, many tasks.** Your task is a slice of an ongoing codebase, not a greenfield project. Before deciding anything on a new or unfamiliar task:
- `dolly project` — repo-level truth: architecture, conventions, invariants. NOT the same as CLAUDE.md (that is how to behave; this is what is true about the code). You maintain it: `dolly project set "<Section>" --text "..."` when you learn something durable.
- `dolly board --all` — what exists, what is in flight, what shipped.
- `dolly related --files a.ts,b.ts` — which tasks already touched that code and what they concluded. dolly records the files of every step, so this is the one link nothing else can give you. Read it before changing shared code; you may be about to undo a deliberate choice.
- Code map (`.codegraph/`, `graft/`, `.serena/`) if present — use it before grep. dolly does not index code and you should not hand-roll one.

**Start of session / picking work back up** — read in tiers
- `dolly board` — all tasks by status. Tiny.
- `dolly context current` — **the default**. Project brief, related tasks, spec (short + full), criteria, whole log, last 3 steps' FULL context. Run BEFORE touching code on an existing task: the log says what happened, full step context says why.
- `dolly context <ref> --brief` — spec + criteria + log only, no step bodies. For orienting.
- `dolly context <ref> -n 0` — every step in full. Archaeology only.
- `dolly continue <ref>` — reopen the Claude Code conversation a task was worked in (`claude --resume <session>`).
Session-start injection is an index, not the record. Still run `dolly context`.
`<ref>` = id (`3`, `0003`), slug, unique substring, or `current`.

**Log every major step. Not optional.**
```
dolly step current -m "<what changed and why, 1-3 lines>" --auto-files --detail-file <notes.md>
```
- Major step = feature slice done, bug root-caused, migration written, approach abandoned. Not every edit.
- `-m` short summary → lands in `task.md` (the file humans + agents skim). **State the OUTCOME — what you understood and did — never restate the request.** Bad: `add country filter`. Good: `Country filter lands as an AND-ed where clause; needed a composite index or p95 blew past 300ms.`
- `--detail` / `--detail-file` long context → appended to `context/steps.md` (decisions, dead ends, snippets, next hints). Write it like a note to the next agent who has zero context.
- `--auto-files` reads changed files from git. Use `--files a.ts,b.ts` when git noisy.
- Log a step BEFORE any risky refactor and AFTER it lands.

**Spec changed mid-flight?** Never silently rewrite history.
```
dolly spec current --short "<new 2-5 line summary>" --file <new-full-spec.md> --reason "<why changed>"
```
Bumps spec version. Old version move to "Superseded versions" at bottom of same `context/spec.md`. Only short spec in `task.md` get replaced.

**Status board** — `todo → planning → working → validating → done`
```
dolly status current working
dolly status current validating --note "<what human must check>"
```
`validating` mean YOU done, HUMAN must verify. Move there when work complete, never straight to `done`. Human sets `done`.

**Planning mode** (use when user describe feature, not a one-liner fix)
1. `dolly plan start "<title>" --brief "<user's words>"` — creates task, status `planning`.
2. `dolly plan check <ref>` — prints unfilled sections + open questions. This is your interview agenda.
3. ASK USER the questions. One batch, grouped, concrete. No inventing answers. Record each:
   `dolly plan qa <ref> -q "<question>" -a "<user answer>"`
4. Fill sections as answers arrive:
   `dolly plan set <ref> "Success Criteria" --text "- [ ] ..."`
   Sections: Problem, Goal, Scope (In/Out), Success Criteria, Changes, Risks, Test Plan, Open Questions.
5. `dolly plan check <ref>` until `ok`. Every open question checked off or answered.
6. `dolly plan finalize <ref>` — derives spec + criteria from plan, status → `todo`.
Then work it normally.

**Skip planning** for small tasks: `dolly new "<title>" --short "<spec>"` and go.

**Conversation started before dolly existed here?** Adopt it, don't lose it.
```
dolly reindex                    # digest of this session: requests verbatim, files touched, commands run
dolly reindex --apply            # import: creates task, one step per turn. Idempotent.
```
Then replace the imported spec with a real one (`dolly spec`) — import only stitches raw requests together, you have the actual understanding.

**Auto-logging** — with hooks installed dolly appends a mechanical step per finished turn from the transcript, so the log has no holes. It skips any turn you logged yourself, and its summaries are worse than yours. Keep logging real steps; treat auto-entries as the floor. Off: `dolly config set reindex.autoLog false`.

**Housekeeping** — `dolly housekeep --dry-run` shows what ages out. Runs automatically once/day. Config in `.dolly/config.json`.

**Version skew** — the store carries a schema version. Lossless upgrades apply themselves; anything that moves or rewrites data warns and waits for `dolly migrate`. If dolly refuses a write because the store is NEWER than your dolly, do NOT force it — a teammate wrote it with a newer version, so upgrade dolly instead.

**Rules**
- Task state lives in files, not in your head or this conversation.
- Durable fact about the repo → project brief. Fact about what this task did → step.
- One task = one feature. Split when scope grows, and check `dolly related` before opening one adjacent to existing work.
- Never edit `.dolly/**` by hand — use the CLI so frontmatter, versions and step counters stay consistent.
- Steps are append-only history. Correct a wrong step with a new step, don't rewrite.
- Every step stamped with git/github user → teammates see who did what. Commit `.dolly/` with your code.
<!-- /dolly:instructions -->
