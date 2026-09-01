---
id: dhhjdz3b
slug: fix-review-findings-on-the-fuzzy-memo-zcode-comm
title: "Fix review findings on the fuzzy/memo/zcode commits: picker hang, memo file trailers, update --check"
status: validating
owner: nick-delirium
collaborators: [nick-delirium]
tags: []
steps: 1
spec_version: 1
created: 2026-09-01T07:29:07Z
updated: 2026-09-01T07:29:52Z
sessions: [1db55685-411f-4cb5-8ecf-6c263f7aeb07]
---

# dhhjdz3b · Fix review findings on the fuzzy/memo/zcode commits: picker hang, memo file trailers, update --check

<!-- dolly:header -->
`validating` · spec v1 · @nick-delirium · 1 step · updated 2026-09-01 07:29Z
<!-- /dolly:header -->

## Spec

Review of 9eb5f41 + 701d3d9 found seven defects. Two blocking: the numbered ambiguous-ref picker loops forever on EOF stdin, and tests/memo.test.mjs was not hermetic so npm test was red on any machine with Claude Code transcripts for this repo. Plus: dolly memo dropped the files: trailer for multi-line step summaries, dolly update --check never worked for npm installs, readTaskDir could produce an empty id, search() matched rel so 'tasks' hit every task, and the picker highlight was not reset on query edits.

## Success Criteria

- [ ] _TBD_

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-09-01 07:29Z` @nick-delirium: Seven review findings on 9eb5f41 + 701d3d9 fixed. Two were blocking: the numbered ambiguous-ref picker spun forever on a closed stdin (line() never resolved at EOF, the loop treated empty as retry, and resolveRef gated on stdout being a TTY but not stdin), and tests/memo.test.mjs read the developer's real ~/.claude/projects because sandbox() pins the store but not the cwd — npm test was green in CI and red on any machine with a session for this repo.
  dolly memo also dropped the files: trailer for any multi-line step summary (the entry regex captured one following line, and logLine puts trailers last), and dolly update --check hardcoded the git lookup that by definition cannot work for the npm installs the update notice sends there.
  files: `src/cli.ts`, `src/core/memo.ts`, `src/core/store.ts`, `src/core/update.ts`, `src/prompt.ts`, `tests/memo.test.mjs` +2 more · full: `steps.md#0001`
- `2026-09-01 07:29Z` @nick-delirium: status working → validating. run npm test on your own machine (that is where it was red); then try: dolly show add < /dev/null should print candidates and exit 1, not hang; dolly update --check should name its source

