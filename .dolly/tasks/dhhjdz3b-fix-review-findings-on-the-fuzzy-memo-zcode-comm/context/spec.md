<!-- dolly spec · task dhhjdz3b -->
# Spec — Fix review findings on the fuzzy/memo/zcode commits: picker hang, memo file trailers, update --check

**current: v1** · updated 2026-09-01T07:29:07Z by @nick-delirium

<!-- dolly:spec-current -->
<!-- v1 · 2026-09-01T07:29:07Z · @nick-delirium -->

Review of 9eb5f41 + 701d3d9 found seven defects. Two blocking: the numbered ambiguous-ref picker loops forever on EOF stdin, and tests/memo.test.mjs was not hermetic so npm test was red on any machine with Claude Code transcripts for this repo. Plus: dolly memo dropped the files: trailer for multi-line step summaries, dolly update --check never worked for npm installs, readTaskDir could produce an empty id, search() matched rel so 'tasks' hit every task, and the picker highlight was not reset on query edits.
<!-- /dolly:spec-current -->

---

## Superseded versions

<!-- dolly:spec-history -->
_none — v1 is the first spec_
<!-- /dolly:spec-history -->
