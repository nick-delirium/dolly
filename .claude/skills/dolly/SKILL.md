---
name: dolly
description: >
  Long-term task memory. Read and write .dolly/ — task board, step log, spec history.
  Use when: starting work on existing task, picking work back up after context reset,
  finishing a slice of work, spec changed mid-flight, user asks "what was I doing",
  "where did we leave off", "log this", "what's the status", or any dolly command.
  Also use before touching code on a task that already has history.
---

Task memory live in `.dolly/`. Git-tracked. Shared with teammates. You write it — nobody else will.

## Rule zero

Never trust memory of conversation. State live in files. Read before write.

## Rehydrate first — read in tiers, not all at once

| Need | Command | Cost |
|---|---|---|
| what work exists | `dolly board` | tiny |
| picking up a task, about to write code | **`dolly context <ref>`** ← default | moderate |
| just orienting, don't need step detail | `dolly context <ref> --brief` | small |
| archaeology: why is this code like this | `dolly context <ref> -n 0` | large |

`dolly context <ref>` is the right answer almost always: spec (short + full), criteria, the whole one-line log, plus the last 3 steps' FULL context. The short log alone tell you *what* happened; full step context tell you *why* — you need why before you change code.

Session start already inject spec + criteria + last events. That is the index, NOT the record. Still run `dolly context` before editing.

`<ref>` = id (`3`, `0003`) · slug · unique substring · `current` · `@`.

Output written for you, not humans. Read it whole. It carry decisions and dead ends from previous sessions — including other people's sessions.

## Log every major step

```
dolly step current -m "<1-3 lines: what changed, why>" \
  --auto-files \
  --detail-file /tmp/step-notes.md
```

Major step = feature slice landed · bug root-caused · migration written · approach abandoned · dependency added. NOT every file edit.

Two tiers, both required:

| Flag | Lands in | Content |
|---|---|---|
| `-m` | `task.md` (short, shared, skimmed by humans) | 1-3 lines. What you understood and did. |
| `--detail-file` / `--detail` | `context/steps.md` (full, append-only) | Note to next agent with zero context: decisions + reasons, rejected options + why, gotchas, exact snippets, what to do next. |

**Summary is an OUTCOME, never a restatement of the request.** Log is for continuity — next agent need to know what is true now, not what was asked.

- bad: `add country and browser filters` ← that is the request, worthless
- good: `Filters land in search endpoint as AND-ed where clauses. Needed composite index on (country, browser) or p95 blew past 300ms.`

Say what you concluded, what you built, what surprised you. Request already in the spec.

`--auto-files` pull changed files from git. Use `--files a.ts,b.ts` when git dirty with unrelated stuff.

Log a step BEFORE risky refactor (so rollback context exist) and AFTER it land.

Step without `--detail` is half a step. Write the detail.

## Statuses

`todo → planning → working → validating → done`

```
dolly status current working
dolly status current validating --note "<exactly what human must check>"
```

`validating` = you done, human must verify. Move there when work complete. **Never set `done` yourself** — that human's call.

Pick up work → `dolly status <ref> working` first, then log steps.

## Spec changed mid-flight

Never silently rewrite. Version it:

```
dolly spec current \
  --short "<new 2-5 line summary>" \
  --file /tmp/new-full-spec.md \
  --reason "<why it changed>"
```

Bumps version. Old spec move down into "Superseded versions" at bottom of same `context/spec.md`, with your reason. Replaces only short summary in `task.md`. Nothing lost, one file to read.

`--short` alone = summary-only tweak, no version bump.

## New task, no planning needed

```
dolly new "<title>" --short "<2-5 line spec>" --criteria "x works" --criteria "y works" --tag auth
```

Feature that need questions answered → use the **dolly-planning** skill instead.

## Layout

```
.dolly/
  config.json
  tasks/0001-oauth-login/
    task.md          # meta + short spec + criteria + one-line-per-event log  ← the shared file
    context/
      spec.md        # current full spec on top, superseded versions below it
      steps.md       # full context of every step, append-only
      plan.md        # planning interview record (only if planned)
  archive/2026-08/…  # aged-out tasks
```

`task.md` Log is flat and chronological — one line per event:

```
- `2026-08-07 10:22Z` @nick-delirium: Wired GitHub OAuth callback route.
  files: `src/auth/callback.ts` · full: `steps.md#0003`
- `2026-08-07 11:04Z` @nick-delirium: spec → v2. security review demanded PKCE
```

## Hard rules

- Never hand-edit `.dolly/**`. CLI keep frontmatter, versions, step counters consistent. Hand-edit break them.
- Steps append-only. Wrong step → new step correcting it. No rewriting history.
- One task = one feature. Scope grow → new task, link it in the step detail.
- Commit `.dolly/` with the code. Teammates read your steps, you read theirs.
- Every step stamped with GitHub handle (`gh api user` → git email → `$USER`). `DOLLY_USER` override.
- `dolly housekeep --dry-run` show what ages out. Auto-runs once/day. Tune in `.dolly/config.json`.

## Conversation already started without dolly?

Adopt it — don't start a blank task and lose what happened.

```
dolly reindex                  # digest of THIS session: every request verbatim, files touched, commands run
dolly reindex --apply          # import it: creates task, one step per turn
dolly reindex --apply --into 3 # or attach to existing task
```

Idempotent — re-run any time, turns already imported get skipped.

After import, TWO things are your job:
1. **Replace the spec.** Import stitches raw requests together. You have the conversation — write the real spec: `dolly spec <ref> --short "..." --file <spec.md> --reason "reindexed from session <id>"`.
2. **Fix misleading step summaries** with a corrective step. Never rewrite imported history.

Storage format changed between dolly versions?
```
dolly migrate                       # upgrade old .dolly/ layout in place
dolly reindex --apply --rebuild     # re-derive imported steps from the transcript
```

## Automatic logging

With hooks installed, dolly auto-logs one mechanical step per finished turn, derived from the transcript: what you reported, your work chain, files touched. So the log never has holes.

That does NOT excuse you. Auto-entries are a floor, not a substitute — they lift your last message verbatim, which is usually worse than a written summary. Any turn you log yourself is SKIPPED by the auto-logger. So log real steps at real boundaries; auto-log covers what you forget.

Turn it off: `dolly config set reindex.autoLog false`.

## Jump back into an old conversation

Every step record the Claude Code session it happened in.

```
dolly continue 0003          # prints/opens `claude --resume <session>`
dolly continue 0003 --fork   # resume as a new branch, leaving the original intact
```

Useful when the step log is not enough and you want the actual dialogue back.

## Not initialized?

```
dolly init            # detects agents present, wires them, creates .dolly/
```

Store resolution: `DOLLY_DIR` → nearest `.dolly/` walking up → `<repo-root>/.dolly` → `~/.dolly/projects/<name>-<hash>`.
