---
description: Save a dolly checkpoint for the work just done
argument-hint: "[ref] (default: current)"
allowed-tools: Bash(dolly:*), Bash(git:*), Write
---

Save a checkpoint on `${ARGUMENTS:-current}`.

Working tree:

!`git status --porcelain 2>/dev/null | head -40`

Write the update **from your own understanding**, not from what you were asked:

1. Write the full context to a temp file — what you concluded and why, options you rejected and why, gotchas you hit, exact snippets worth keeping, what the next agent should do next. Address it to someone with zero context.
2. Run:

```
dolly step ${ARGUMENTS:-current} -m "<what you understood and did, 1-3 lines>" --auto-files --detail-file <that temp file>
```

The summary is an **outcome**, not a restatement of the request. Compare:

- bad: `add country and browser filters` — that's the request, it tells the next agent nothing
- good: `Filters land in the search endpoint as AND-ed where clauses; needed a composite index on (country, browser) or p95 blew past 300ms`

If nothing meaningful changed since the last step, say so and stop — an empty checkpoint is noise.

Note: with hooks installed, dolly already auto-logs a mechanical step per turn from the transcript. Running this replaces the need for that turn's auto-entry and produces a far better summary — the auto-logger skips any turn you logged yourself.
