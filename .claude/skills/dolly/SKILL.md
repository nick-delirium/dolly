---
name: dolly
description: >
  Task memory for this repo (.dolly/): board, step log, versioned specs. Use before
  touching code on a task with history, when picking work back up, after a slice of
  work lands, when a spec changes, or for "where did we leave off" / "log this" / any
  dolly command.
---

Task memory live in the dolly store (`dolly whoami` print where; usually `.dolly/`, committed, shared with teammates). State live in files, not in your memory of the conversation. Read before write. Never hand-edit it — CLI keeps frontmatter, versions, step counters consistent.

## One repo, many tasks

Your task is a SLICE of an ongoing codebase. Other tasks came before, made decisions, set conventions. Before deciding anything on an unfamiliar task:

```
dolly project                      # what is true about this repo: architecture, conventions, invariants
dolly board                        # what exists, what is in flight, what shipped
dolly related --files a.ts,b.ts    # which tasks touched this code, and what they concluded
```

`dolly related` is the link nothing else gives you: dolly records the files every step touched. Read it before changing shared code — you may be about to undo a deliberate choice. Skipped it if you: reinvent an existing convention, edit a file against another task's direction, ask what the repo already answers.

Code map in repo (`.codegraph/`, `graft/`, `.serena/`)? Use it before grep. Do not build an index inside `.dolly/`.

## Rehydrate — read in tiers

| Need | Command |
|---|---|
| what work exists | `dolly board` |
| picking up a task, about to write code | **`dolly context <ref>`** ← default |
| orienting only | `dolly context <ref> --brief` |
| archaeology: why is the code like this | `dolly context <ref> -n 0` |

`dolly context` = project brief, related tasks, spec, criteria, log, last 3 steps' full context. Log say *what* happened; step context say *why* — you need why before changing code. Session-start text is only the index.

`<ref>` = 8-char id (`3pkndyj2`) · slug · unique substring · fuzzy title · `current` (default when omitted). Ambiguous → picker in a terminal, list otherwise.

Pick up work → `dolly status <ref> working` first. That also attaches this conversation: auto-log only ever writes to a task the conversation already wrote to.

## Log every major step

```
dolly step current -m "<1-3 lines: what you understood and did>" --auto-files --detail-file <notes.md>
```

Major step = slice landed · bug root-caused · migration written · approach abandoned · dependency added. Not every edit. Log BEFORE a risky refactor and AFTER it lands.

| Flag | Lands in | Content |
|---|---|---|
| `-m` | `task.md` log, skimmed by humans | OUTCOME. Never the request. |
| `--detail-file` / `--detail` | `context/steps.md`, append-only | Note to an agent with zero context: decisions + why, rejected options + why, gotchas, snippets, next. |

- bad: `add country and browser filters` ← the request, worthless
- good: `Filters land in search endpoint as AND-ed where clauses. Needed composite index on (country, browser) or p95 blew past 300ms.`

Step without detail is half a step. `--auto-files` read changed files from git; `--files a.ts,b.ts` when git is noisy. Text/file flags take `-` for stdin.

With hooks installed, dolly auto-logs a mechanical step per finished turn (lifted from your last message). Floor, not substitute — a turn you log yourself is skipped by the auto-logger, and your summary is better.

## Statuses

`todo → planning → working → validating → done`

```
dolly status current validating --note "<exactly what the human must check>"
```

`validating` = you are done, human must verify. **Never set `done`** — human's call.

## Spec changed mid-flight

Never silently rewrite. Version it:

```
dolly spec current --short "<2-5 line summary>" --file <new-full-spec.md> --reason "<why it changed>"
```

Old spec moves to "Superseded versions" at the bottom of the same `context/spec.md`, with the reason. `--short` / `--criteria` alone = no version bump, still logged.

## New task

Needs questions answered → **dolly-planning** skill. Small and understood:

```
dolly new "<title>" --short "<2-5 line spec>" --criteria "x works" --criteria "y works" --tag auth
```

One task = one feature. Scope grows → new task, link it in the step detail.

## Repo-level knowledge → `dolly project`

`.dolly/project.md`: Overview, Architecture, Conventions, Invariants, Glossary — what is TRUE about the code (CLAUDE.md says how to BEHAVE). You maintain it: learn a boundary, a banned pattern, an invariant, why something is shaped weird → `dolly project set "<Section>" --text "..."`. Find it wrong → fix it; a stale brief is worse than none. Fact useful to a task that does not exist yet → brief. Fact about what THIS task did → step.

## Conversation already started without dolly?

```
dolly reindex                     # digest of THIS session: requests verbatim, files touched, commands run
dolly reindex --apply             # import it: new task, one step per turn (idempotent)
dolly reindex --apply --into <ref>
```

Then replace the imported spec (it only stitches raw requests together): `dolly spec <ref> --short "..." --file <spec.md> --reason "reindexed from session <id>"`. Fix misleading imported summaries with a corrective step, never by rewriting.

## Hard rules

- Steps are append-only. Wrong step → a new step correcting it.
- Commit `.dolly/` with the code — unless `dolly whoami` says the store is `linked`/`global` (outside the repo, private, nothing to commit).
- Every step is stamped with your handle (`DOLLY_USER` → `.dolly/local.json` → `gh` → git email → `$USER`).
- Store newer than your dolly → writes refused. Do NOT work around it; upgrade dolly. Older store → lossless upgrades apply themselves; risky ones wait for `dolly migrate` (`--dry-run` first).
- Want the old dialogue back: `dolly continue <ref>` prints `claude --resume <session>`.
- Not initialized: `dolly init`.
