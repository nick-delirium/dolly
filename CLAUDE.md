<!-- dolly:instructions -->
## dolly — task memory for this repo

Task memory lives in the dolly store — usually `.dolly/`, committed; `dolly whoami` prints where. Your task is one slice of an ongoing codebase: read state, never guess it. Never hand-edit the store — use the CLI. Full guide: the **dolly** skill, or `dolly guide`.

- **Before code on a task:** `dolly context <ref>` (id, slug or fuzzy title; omitted = `current`). Session-start text is only an index. Unfamiliar area: `dolly project` (what is true about this repo) and `dolly related --files a.ts,b.ts` (tasks that touched that code, and what they decided).
- **Pick up work:** `dolly status <ref> working` — also attaches this conversation, so auto-log follows it.
- **Log every major step** (slice landed, bug root-caused, approach dropped): `dolly step current -m "<outcome, not the request>" --auto-files --detail-file <notes.md>`. Notes = handoff for an agent with zero context: decisions, dead ends, what next.
- **Spec changed:** `dolly spec current --short "<2-5 lines>" --file <spec.md> --reason "<why>"` — the old version is kept.
- **Finished:** `dolly status current validating --note "<what the human must check>"`. Never set `done` — the human does.
- **Feature, not a one-liner:** plan first — **dolly-planning** skill, `dolly plan start "<title>"`. Small fix: `dolly new "<title>" --short "..."`.
- Durable fact about the codebase → `dolly project set "<Section>" --text "..."`. What this task did → a step.
- Store newer than your dolly → writes are refused: upgrade dolly, never work around it.
<!-- /dolly:instructions -->
