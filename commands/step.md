---
description: Log the work just done as a dolly step
argument-hint: "[ref] (default: current)"
allowed-tools: Bash(dolly:*), Bash(git:*), Write, Read
---

Log what you just did on task `${ARGUMENTS:-current}`.

Current state:

!`dolly show ${ARGUMENTS:-current} 2>&1 | head -30`

Changed files:

!`git status --porcelain 2>/dev/null | head -40`

Then:

1. Write the full context to a temp file first — decisions and why, options rejected and why, gotchas found, exact snippets worth keeping, what the next agent should do next. Write it for someone with zero context.
2. Run:

```
dolly step ${ARGUMENTS:-current} -m "<1-3 line summary>" --auto-files --detail-file <that temp file>
```

3. Work complete? `dolly status ${ARGUMENTS:-current} validating --note "<what the human must check>"`. Never set `done` yourself.

Summary is what humans skim — make it say what changed and why, not "updated files".
