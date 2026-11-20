<!-- dolly plan · created 2026-11-20T08:51:35Z · @nick-delirium -->
# Plan — dolly dream: periodic summaries + one curated facts file

> Interview record. Every section below must be answered before `dolly plan finalize`.
> Gate: `dolly plan check` fails while a section is empty, `_TBD_`, or an Open Question is unchecked.

## Brief

I also want to have a "dream" command that lets the model "sleep" and "dream" while doing that, summarizing recent work, ideas, core decisions, what went wrong and what went good - perhaps we can keep one file with important stuff and facts that will get updated plus "dream" files which will have more context on current day or week summarized? Not sure whats the best approach but main thing to be careful with is context size: we don't want to occupy to much of context, ideally everything should be easy to access on demand and by default we only provide whats required to function perfectly

## Problem

Durable lessons and decisions are scattered across step notes in many tasks. Nothing periodically consolidates them, so each session either re-reads raw history (expensive) or starts without it (repeats mistakes).

`memo` (daily digest, agent writes prose) and `digest` (area rollup over several tasks) both half-do this, but they're separate commands, rarely used (2 memos and 0 digests in this repo), and neither updates the project brief, which is where durable truth is supposed to live.

Context cost is the constraint: `dolly context` is already 13–18KB on a pickup, and the session start is budgeted at about 2KB.

## Goal

`dolly dream` lets the agent "sleep": dolly prints everything since the last dream (task events, agent-written step notes, spec changes, plan answers, commits, the human's prompts) plus the current project brief and the writing rules. The agent, ideally in a subagent, writes a dream (what happened, decisions and why, what went wrong, what went well, ideas and open threads) and saves it into `.dolly/dreams/YYYY-MM-DD.md`, append-only. It then updates the project brief, the one curated facts file, including a new **Lessons** section. A weekly dream rolls the days up into `YYYY-Www.md`. By default a session only sees a pointer line and a nudge when a dream is due; everything else is on demand (`dolly dream show`, `dolly recall`).

## Scope

**In:**
- `dolly dream`: prints the material since the last dream (or 24h), capped; `--since` overrides
- `dolly dream --save --file f --through <stamp>`: appends a dream block to the day file; `--through` pins the window like compact
- `dolly dream --week [YYYY-Www]`: weekly material from that week's day dreams; `--save` writes the week file
- `dolly dream show [date|week]` (default: latest) and `dolly dream list`
- project brief gains a `Lessons` section; the dream material includes the brief and asks for `dolly project set` edits
- session start: one pointer line plus a nudge when a dream is due (replaces the memo nag); config `dream.nudge` (falls back to the legacy `memo.auto`)
- recall indexes dreams (Decisions and Went wrong count as kind decision)
- `/dolly:dream` slash command (subagent in Claude Code), skill text, MCP tool `dolly_dream`
- `memo` and `digest` are removed (stubs point at dream); legacy `memo/` files stay searchable by recall

**Out:**
- any model call: dolly never writes prose itself
- automatic dreaming from a hook (hooks can't write prose); nudges only
- migrating or rewriting legacy memo files
- injecting dream content into session start or `context` beyond the pointer line

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

## Changes

- `src/core/dream.ts` (new): window, material builder, append save, week rollup, list/show, due check
- `src/cli.ts`: `cmdDream`; FLAGS; writesStore (`dream --save`); session-start pointer/nudge replaces the memo line; memo/digest stubs
- `src/core/memo.ts`: keep `gitOn`/`buildDigest` pieces dream reuses (guess: fold into dream.ts and delete memo.ts)
- `src/core/digest.ts`, the digest half of `compact.ts`, board folding: removed
- `src/core/project.ts`: add a `Lessons` section
- `src/core/recall.ts`: dreams as a corpus source
- `src/core/types.ts`: config `dream.nudge`
- `src/mcp.ts`: `dolly_dream` tool (print | save), within the 8KB budget
- `commands/dream.md` (replaces memo.md); `skills/dolly/SKILL.md`; README
- tests: `tests/dream.test.mjs` (new), memo/compact tests trimmed

## Risks

- **The material is too big for the main context.** Fallback: a hard cap, plus the slash command delegating to a subagent; the main context only gets one line.
- **Lessons grows without bound.** Fallback: the rules tell the agent to merge and prune to about 15 bullets; the material shows the current section's size.
- **Weekly rollups never get written.** Fallback: material for a new day mentions any past week that has day dreams but no week file.
- **Removing digests orphans existing `digests/*.md` in other users' stores.** They stay as plain markdown; recall keeps indexing them as legacy notes.
- **Window edge: a clock skew or a step logged mid-dream.** `--through` pins the end, as in compact.

## Test Plan

Unit: window start (no dream → 24h; after a save → through); a material cap that keeps agent notes ahead of auto-steps; append keeps the earlier block byte-identical; week id math (ISO week, year boundary, e.g. 2026-12-31 → 2026-W53); list/show resolution.

Integration (CLI, isolated home): new task + step + spec change → `dream` material contains them; save → second material is empty of them; `dream --week` after two day saves; session start shows the nudge when due and the pointer after a save; recall hit on dream text; memo/digest stubs.

Manual: run `/dolly:dream` in this repo after this work lands and read the result.

## Open Questions

- [x] Facts file: the project brief, plus a Lessons section (answered)
- [x] Cadence and injection: day + week, pointer only, subagent (answered)

## Q&A

**Q (2026-11-20 08:55Z):** Where does the one curated facts file live?

**A:** The project brief (project.md) is the one facts file. Dream proposes edits to it via dolly project set and adds a Lessons section (what went wrong / well, written as rules). dreams/ holds the day and week narratives.

**Q (2026-11-20 08:55Z):** Cadence and what a new session sees by default?

**A:** Daily dream files plus a weekly rollup of the days. Session start gets one pointer line, plus a nudge when work since the last dream is over a day old. In Claude Code /dolly:dream runs in a subagent so the main context only sees that it was saved.

**Q (2026-11-20 08:57Z):** Correction: may dream edit the project brief by itself?

**A:** No — the chosen option said dream PROPOSES edits. Dream never runs dolly project set. Lessons are append-only: bullets under the dream's '### Lessons' heading are appended to the brief's Lessons section by dolly on save, and the save prints exactly what was added. Any other brief change (including pruning Lessons) goes under '### Proposed brief edits' in the dream; save echoes them, session start says 'N brief edits proposed — dolly dream show', and a human applies them (or tells the agent to).

