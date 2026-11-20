---
id: q2wsmks8
slug: dolly-dream-periodic-summaries-one-curated-facts
title: "dolly dream: periodic summaries + one curated facts file"
status: done
owner: nick-delirium
collaborators: [nick-delirium]
tags: []
steps: 2
spec_version: 2
created: 2026-11-20T08:51:35Z
updated: 2026-11-20T10:00:12Z
sessions: [36d7b4d9-0ca0-4cb9-8bd0-8b3723565119]
---

# q2wsmks8 · dolly dream: periodic summaries + one curated facts file

<!-- dolly:header -->
`done` · spec v2 · @nick-delirium · 2 steps · updated 2026-11-20 10:00Z
<!-- /dolly:header -->

## Spec

`dolly dream` prints everything since the last dream, capped, plus the brief and the writing rules. The agent (in a subagent where it can) writes a dream: what happened, decisions, what went wrong, what went well, ideas, Lessons and Proposed brief edits. Saving appends it to `.dolly/dreams/YYYY-MM-DD.md`, appends its Lessons bullets to the brief's Lessons section, and echoes what changed. Other brief edits stay proposals for a human. Weekly rollups go to `YYYY-Www.md`. Sessions see one pointer or nudge line; everything else is on demand.

## Success Criteria

- [ ] `dolly dream` with no prior dream covers the last 24h; after a save, the next material starts at that save's `--through`
- [ ] material is capped at 40KB by default, with agent-written step notes kept ahead of auto-logged ones and the cut stated
- [ ] saving twice on one day appends two blocks to `dreams/YYYY-MM-DD.md`; nothing is ever rewritten
- [ ] `--through` older than an event in the window leaves that event for the next dream
- [ ] `dolly dream --week 2026-W47` rolls up that week's day dreams; saving writes `dreams/2026-W47.md`
- [ ] `dolly dream show` prints the latest dream; `show 2026-W47` and `show 2026-11-20` work; `list` prints one line per file
- [ ] the session start adds at most one line (pointer or nudge) for dreams; footprint tests still pass
- [ ] `dolly recall` finds text from a dream; `--kind decision` hits a dream's Decisions section
- [ ] `dolly project set Lessons --text ...` works, and the brief lists Lessons
- [ ] `dolly memo` and `dolly digest` print a removal note pointing at `dolly dream`
- [ ] zero new runtime deps; npm test green
- [ ] dream never edits a brief section other than appending Lessons bullets; save prints each appended lesson and each proposed edit
- [ ] session start's single dream line says how many brief edits the latest dream proposed (dolly cannot tell an applied proposal from free text)

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-11-20 08:56Z` @nick-delirium: spec → v2. planning finished — spec derived from plan.md
  previous version kept in `spec.md`

### plan finalized · 2026-11-20 08:56Z · @nick-delirium

Plan complete. Status → todo.

- plan: `context/plan.md`
- `2026-11-20 08:57Z` @nick-delirium: short spec + criteria updated. side review: the chosen option said dream proposes brief edits; the plan had it apply them unseen from a subagent
- `2026-11-20 08:57Z` @nick-delirium: criteria updated. restore the planned criteria the previous update dropped
- `2026-11-20 09:05Z` @nick-delirium: status todo → working.
- `2026-11-20 09:12Z` @nick-delirium: dolly dream ships: material since the last dream (40KB cap, agent notes before auto-steps), append-only day/week dream files, Lessons appended to the brief and every other brief edit only proposed; one session-start line; recall indexes dreams; MCP dolly_dream; /dolly:dream runs in a subagent. memo and digest now point at dream.
  files: `src/core/dream.ts`, `src/core/types.ts`, `src/core/store.ts`, `src/core/project.ts`, `src/core/recall.ts`, `src/cli.ts` +8 more · full: `steps.md#0001`
- `2026-11-20 09:12Z` @nick-delirium: criteria updated. proposal 'applied' state is not knowable; report proposed count
- `2026-11-20 09:19Z` @nick-delirium: status working → validating. Run /dolly:dream in this repo: the subagent saves .dolly/dreams/<today>.md, the reply lists Lessons appended + proposed brief edits (not applied). dolly dream show; next session start shows one dream line.
- `2026-11-20 09:51Z` @nick-delirium: Lessons now ride along in dolly context (full read only): the newest within ~900 bytes, older ones named by count; session start and --brief stay without them. Raised by a side review: lessons left on-demand would not be in front of an agent about to repeat the mistake.
  files: `src/core/project.ts`, `src/core/render.ts`, `tests/footprint.test.mjs`, `skills/dolly/SKILL.md`, `README.md` · full: `steps.md#0002-nick-delirium`
- `2026-11-20 10:00Z` @nick-delirium: status validating → done. Reviewed: built and tested this session (362 tests green). Dream ran on this repo.

