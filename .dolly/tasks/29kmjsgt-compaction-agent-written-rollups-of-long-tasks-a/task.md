---
id: 29kmjsgt
slug: compaction-agent-written-rollups-of-long-tasks-a
title: "Compaction: agent-written rollups of long tasks and task groups"
status: validating
owner: nick-delirium
collaborators: [nick-delirium]
tags: []
steps: 2
spec_version: 2
created: 2026-10-20T10:39:40Z
updated: 2026-10-20T11:27:34Z
sessions: [30490afd-79ca-44be-91bb-1f8b86dff17b]
---

# 29kmjsgt · Compaction: agent-written rollups of long tasks and task groups

<!-- dolly:header -->
`validating` · spec v2 · @nick-delirium · 2 steps · updated 2026-10-20 11:27Z
<!-- /dolly:header -->

## Spec

Human-triggered, agent-written compaction. `dolly compact <ref>` prints the task's un-compacted step material plus writing instructions; the agent writes a rollup; `--save` appends it to steps.md as a rollup block and moves the covered step bodies verbatim into `context/steps.compacted.md`. `dolly context` then shows the rollup plus the recent steps, so nothing decided early is lost from view. `dolly compact --tasks a,b,c --title "<t>"` does the same across tasks into `.dolly/digests/<slug>.md`; covered tasks carry `digest:`, the board folds finished covered tasks under it, and context/related point at it. Nothing is deleted and dolly never writes the prose itself.

Out of scope: automatic or size-triggered compaction (a nudge only); dolly generating summary text — no model; deleting step bodies or rewriting task.md log lines; an un-compact command (moved blocks are verbatim; git revert undoes it); digests of digests.

Full spec: `context/spec.md` · plan: `context/plan.md`

## Success Criteria

- [ ] compact a 29-step task with `--keep 3`: steps.md holds 1 rollup + 3 step blocks; steps.compacted.md holds the 26 blocks byte-identical to before
- [ ] the next `dolly step` on it is number 31 (29 steps + rollup 30), never a reused number
- [ ] `dolly context` shows the rollup then the last 3 steps and none of the compacted bodies
- [ ] save refuses: empty prose, `--through` past the newest step or inside the kept window, nothing to compact
- [ ] re-compaction leaves one live rollup; the old one moved aside with the steps
- [ ] interrupted save (compacted file written, steps.md not) → re-running save converges, no duplicated blocks
- [ ] group: digests/<slug>.md has covers + prose; each covered task has `digest:` + log line; board folds done covered tasks; `dolly digest` lists it
- [ ] `dolly recall` finds text that now lives only in steps.compacted.md, with that file's path:line
- [ ] `dolly_compact` over MCP; footprint tests green; npm test green

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
- `2026-10-20 11:07Z` @nick-delirium: status todo → working.
- `2026-10-20 11:14Z` @nick-delirium: dolly compact: agent-written rollups (old bodies move verbatim to steps.compacted.md, context shows rollup + last 3, numbers never reused, crash-safe) and digests for several tasks (.dolly/digests, digest: frontmatter, board folds done ones); recall/related/reindex still read moved bodies; dolly_compact over MCP.
  files: `src/core/compact.ts`, `src/core/digest.ts`, `src/core/task.ts`, `src/core/types.ts`, `src/core/store.ts`, `src/core/render.ts` +10 more · full: `steps.md#0001`
- `2026-10-20 11:14Z` @nick-delirium: status working → validating. npm test (311). Try on a COPY first: cp -R .dolly /tmp/x && DOLLY_DIR=/tmp/x dolly compact 6mq9hmg4, write a rollup, --save it, read dolly context 6mq9hmg4. Digest: DOLLY_DIR=/tmp/x dolly compact --tasks qfcm3sn9,twjnrqcd,6qp6wxbq --title 'Install targets' then board. MCP tool list at 8987/9000 bytes.
- `2026-10-20 11:27Z` @nick-delirium: Review fixes: id collision in steps.compacted.md now refused (was silent body loss), reindex finds compacted imports (was a duplicate task), --through required on save, numeric flags reject typos.
  files: `src/core/task.ts`, `src/core/compact.ts`, `src/reindex.ts`, `src/core/args.ts`, `src/cli.ts`, `src/mcp.ts` +2 more · full: `steps.md#0002`

