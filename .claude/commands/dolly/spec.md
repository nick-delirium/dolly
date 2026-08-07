---
description: Update a dolly task spec, keeping the old version in the same file
argument-hint: "[ref] <what changed>"
allowed-tools: Bash(dolly:*), Read, Write
---

Spec change requested: **$ARGUMENTS**

Current spec:

!`dolly show ${1:-current} --full 2>&1 | head -60`

Then:

1. Write the new full spec to a temp file. Keep every section the old one had — Problem, Goal, Scope, Success Criteria, Changes, Risks, Test Plan. Change only what actually changed.
2. Run:

```
dolly spec ${1:-current} --short "<new 2-5 line summary>" --file <temp file> --reason "<why it changed>"
```

This bumps the spec version and moves the old spec into the "Superseded versions" section at the bottom of `context/spec.md`. Never edit that section by hand.

3. Did the change invalidate work already logged? Log a step saying so: `dolly step ${1:-current} -m "spec v N changed X, so <what needs redoing>" --detail-file <notes>`.

Summary-only tweak with no substantive change → `--short` alone, no version bump.
