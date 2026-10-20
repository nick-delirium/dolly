---
id: 355wphgs
slug: dolly-review-human-walkthrough-of-validating-tas
title: "dolly review: human walkthrough of validating tasks"
status: validating
owner: nick-delirium
collaborators: [nick-delirium]
tags: []
steps: 2
spec_version: 2
created: 2026-10-20T10:39:40Z
updated: 2026-10-20T11:27:35Z
sessions: [30490afd-79ca-44be-91bb-1f8b86dff17b]
---

# 355wphgs · dolly review: human walkthrough of validating tasks

<!-- dolly:header -->
`validating` · spec v2 · @nick-delirium · 2 steps · updated 2026-10-20 11:27Z
<!-- /dolly:header -->

## Spec

`dolly review` gives a human one interactive pass over the validating queue, oldest first. Per task it shows the short spec, criteria with their checkboxes, the note the agent left when it moved the task to validating, the files and the step count; the human ticks criteria, marks done, sends it back to working with a note, or skips. Every action goes through core functions and leaves a log line. Agents cannot use it.

Out of scope: agents closing tasks; editing spec or criteria text from the review screen; bulk "mark all done".

Full spec: `context/spec.md` · plan: `context/plan.md`

## Success Criteria

- [ ] without a TTY (or under an agent) `dolly review` exits non-zero with a human-only message; the store is unchanged
- [ ] validating tasks are walked oldest-updated first; each screen shows short spec, criteria, validation note, files
- [ ] toggling criterion 2 changes only that line of task.md and logs "criterion 2 checked"; frontmatter round-trips
- [ ] done → status done with log line; back-to-working requires a non-empty note
- [ ] numbered fallback works end to end (injected Term test)
- [ ] a `dolly hook stop` run while review waits on a key completes (lock not held while idle)
- [ ] npm test green

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
- `2026-10-20 11:15Z` @nick-delirium: status todo → working.
- `2026-10-20 11:18Z` @nick-delirium: dolly review: human-only walk over the validating queue (tick criteria, done, back with a note, skip), per-action locking, refuses under agents; criteria placeholders no longer count; board points at the queue.
  files: `src/review.ts`, `src/core/task.ts`, `src/core/render.ts`, `src/cli.ts`, `skills/dolly/SKILL.md`, `README.md` +3 more · full: `steps.md#0001`
- `2026-10-20 11:18Z` @nick-delirium: status working → validating. In a real terminal: dolly review — walk a few of the 13 waiting tasks (tick, done, send one back, skip, quit). Check the screens read well and task.md diffs only touch the box + a log line. npm test (318).
- `2026-10-20 11:27Z` @nick-delirium: Review fix: criteria heading matched case-sensitively (## Success criteria showed none); now case-insensitive like getSection.
  files: `src/core/task.ts`, `tests/review.test.mjs`

