---
name: dolly-planning
description: >
  Planning mode for a new feature. Interview the user until success criteria, scope,
  risks, changes and test plan are all pinned down, then generate the spec.
  Use when: user describes a feature or change rather than a one-line fix, says
  "plan this", "let's design", "I want to build X", "spec this out", "/dolly-plan",
  or when a task sits in status `planning`. Not for small bounded fixes.
---

Plan before code. Interview until nothing ambiguous. Then spec write itself.

## Flow

```
1. dolly plan start "<title>" --brief "<user's own words, verbatim>"
2. dolly plan check <ref>              → your interview agenda
3. ASK USER the open items. One batch. Wait for answers.
4. dolly plan qa <ref> -q "..." -a "..."          record each answer
   dolly plan set <ref> "<Section>" --text "..."  fill sections
5. repeat 2-4 until `plan check` say complete
6. dolly plan finalize <ref>           → spec + criteria generated, status → todo
```

Then hand to the **dolly** skill and work it.

## Sections you must fill

| Section | What good looks like |
|---|---|
| **Problem** | What hurt today, who feel it, evidence — bug id, metric, user quote. Not "we lack X". |
| **Goal** | One paragraph. What is true after ship. |
| **Scope** | `**In:**` bullets · `**Out:**` bullets. Out is the valuable half — write it. |
| **Success Criteria** | Checkbox list. Each verifiable by human or test. "fast" bad, "p95 < 300ms on 1M rows" good. |
| **Changes** | Files, modules, schemas, configs, migrations. Guesses fine — mark them `(guess)`. |
| **Risks** | What break, what uncertain, fallback for each. |
| **Test Plan** | Named cases per layer. Unit / integration / manual. Not framework names. |
| **Open Questions** | Blockers. `- [ ]` unchecked = blocks finalize. Check when answered. |

## Asking questions — rules

- **Never invent an answer.** Unknown → Open Question → ask.
- Batch them. One message, grouped by section, max ~7 at a time. Not a 20-question interrogation, not one question per turn.
- Concrete and closed where possible. Offer options with a recommendation:
  > Country source: (a) GeoIP at session start, (b) user profile field, (c) both with GeoIP fallback. Recommend (a) — already stored, zero extra write path. Which?
- Ask what a senior engineer would ask before writing code: what happen at scale, what happen on failure, who consume this, what already exist that do half of it, what must NOT change.
- Read the code before asking. Question already answered by the repo is a wasted turn — grep first, then ask only what code can't tell you.
- Record every answer with `dolly plan qa`. Answers become the Decisions section of the spec. Unrecorded answer is lost the moment context resets.

## The gate

`dolly plan check <ref>` exit 1 while any section blank/`_TBD_` or any Open Question unchecked. `dolly plan finalize` refuse the same.

Genuinely can't resolve something and user says ship anyway → `dolly plan finalize <ref> --force`. Then record the unknown as a Risk. Don't reach for `--force` to skip work.

## Finalize output

`finalize` derive:
- **full spec** → `context/spec.md` (Problem, Goal, Scope, Criteria, Changes, Risks, Test Plan, Decisions from Q&A). Previous spec moves to "Superseded versions" in the same file.
- **short spec** → `task.md` (Goal + out-of-scope line)
- **criteria** → checkbox list in `task.md`
- status → `todo`

`plan.md` stay as the interview record. Never deleted.

## Override the derived spec

Wrote a better spec by hand:

```
dolly plan finalize <ref> --file /tmp/spec.md --short "<2-5 lines>"
```

## Small task, no interview

```
dolly new "<title>" --short "<spec>"
```

Don't run a planning interview on a typo fix.
