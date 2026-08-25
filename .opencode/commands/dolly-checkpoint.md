---
description: Save a dolly checkpoint for the work just done (same as /dolly:step)
argument-hint: "[ref] (default: current)"
allowed-tools: Bash(dolly:*), Bash(git:*), Write
---

Same as `/dolly:step` — see the **dolly** skill for the rules.

!`git status --porcelain 2>/dev/null | head -30`

```
dolly step ${ARGUMENTS:-current} -m "<what you understood and did>" --auto-files --detail-file <notes>
```

Nothing meaningful changed since the last step? Say so and stop; an empty checkpoint is noise.

With hooks installed dolly already auto-logs a mechanical entry per turn. Logging yourself replaces it and produces a better summary.
