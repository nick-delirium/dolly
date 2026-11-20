<!-- dolly steps · task q2wsmks8 · append-only, newest at the bottom -->
# Full step context — dolly dream: periodic summaries + one curated facts file

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001 -->
## 0001 · 2026-11-20T09:12:26Z · @nick-delirium

- task status: working
- files: `src/core/dream.ts`, `src/core/types.ts`, `src/core/store.ts`, `src/core/project.ts`, `src/core/recall.ts`, `src/cli.ts`, `src/mcp.ts`, `commands/dream.md`, `commands/memo.md`, `skills/dolly/SKILL.md`, `README.md`, `tests/dream.test.mjs`, `tests/memo.test.mjs`, `tests/recall.test.mjs`

## What exists now
- `src/core/dream.ts`: `dayMaterial` (window = last day dream's `through`, else 24h; capped at 14d unless `--since`; 40KB cap, priority: task events/plan answers (0) > agent step bodies (1, clipped 2.5KB) > auto-logged bodies (3, compactStep + 600 chars) — cut is stated), `weekMaterial`, `saveDream`, `listDreams`, `lastDayDream`, `dueWeek`, `dreamLine`, `isoWeek`, `sectionBullets`.
- Files: `.dolly/dreams/YYYY-MM-DD.md` and `YYYY-Www.md`; blocks `&lt;!-- dolly:dream <through ISO> -->` with `## Dream · <day> HH:MMZ · @user` + `- covers: <from> → <through>`; prose headings demoted to ### or deeper. Appended via md.appendBlock — never rewritten.
- Brief: `Lessons` added to PROJECT_SECTIONS. `saveDream` appends bullets under the dream's `### Lessons` to the brief's Lessons (dedup by normalized text). `### Proposed brief edits` bullets are only returned/printed — NEVER applied (side review caught that the first plan applied them; user had chosen "propose").
- Window edges: log stamps are minute-precision, so the lower bound is floored to the minute → an event in the save minute can show twice, never dropped. `--through` is required on save (pins the window like compact); a save whose through ≤ last dream's through is refused.
- Session start: `dreamLine` = one line: "Last dream Nd ago (N brief edits proposed) — `dolly dream show`." + nudge "Undreamt work / week W not rolled up: … `/dolly:dream`". Due = log activity after the last dream AND (last dream > 24h old, or never dreamt and the oldest undreamt event > 20h old). Config `dream.nudge` (default true) replaced `memo.auto`; the old `memo` key in existing config.json files is now ignored (dead — the v8 migration can drop it).
- recall: kind `dream` (labels `dream <period>`; legacy `memo/` and `digests/` files indexed as kind dream with labels `memo <date>`/`digest <slug>`); `KIND_ALIASES` maps `--kind memo|digest` → dream; DECISION_HEADING now also matches lessons / went wrong. Week dreams weigh 1.2.
- CLI `dolly dream [--since] | --week [YYYY-Www] | show [period] | list`, `--save --through --file`. `REMOVED` map in cli.ts main(): `memo`, `digest` exit 1 with a pointer (checked before flag parsing so their old flags don't error first).
- MCP `dolly_dream` (material | save); `dolly_compact` lost its digest params. Tool list 7855B (<8000 — tight; the related→why merge should free room).
- `commands/dream.md` replaces memo.md: delegates to a subagent (Agent/Task) so the material never enters the main context; reports lessons + proposals to the user.

## Spec deviation
"session start says how many brief edits are proposed and UNAPPLIED": dolly cannot know a proposal was applied (free-form text, `project set` has no link back). Implemented as "proposed in the latest dream". Criterion reworded.

## Left for the commands task (n58fpdzt)
digest code (digest.ts, compact.ts digest half, board folding, cmdDigest, compact --tasks, tests in compact.test.mjs) — two failing digest tests until then. memo.ts still exists only because nothing deleted it yet (no imports left).
<!-- /dolly:step 0001 -->

<!-- dolly:step 0002-nick-delirium -->
## 0002 · 2026-11-20T09:51:26Z · @nick-delirium

- task status: validating
- files: `src/core/project.ts`, `src/core/render.ts`, `tests/footprint.test.mjs`, `skills/dolly/SKILL.md`, `README.md`

recentLessons(store, max=900) in project.ts keeps whole bullets newest-first (dreams append at the end, so a top-down clip would drop exactly the new ones); prefix '_N older lessons — dolly project._'. projectDigest got shownElsewhere so the 'Also in the brief' pointer drops Lessons only when they are shown. 27cnrmhh full context +~380B (18.1KB→18.5KB); --brief unchanged (4.8KB). Reverting = drop the recentLessons call in renderContext.
<!-- /dolly:step 0002-nick-delirium -->
