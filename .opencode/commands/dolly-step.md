---
description: Log the work just done as a dolly step
argument-hint: "[ref] (default: current)"
allowed-tools: Bash(dolly:*), Bash(git:*), Write
---

!`dolly show ${ARGUMENTS:-current} 2>&1 | head -20`

!`git status --porcelain 2>/dev/null | head -30`

Log it per the **dolly** skill — the summary is an outcome, not a restatement of the request, and the detail file is a handoff note for an agent with zero context:

```
dolly step ${ARGUMENTS:-current} -m "<what you understood and did>" --auto-files --detail-file <notes>
```

Work complete? `dolly status ${ARGUMENTS:-current} validating --note "<what the human must check>"`. Never set `done`.
