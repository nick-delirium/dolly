---
description: Show the dolly task board
argument-hint: "[--all] [--status working]"
allowed-tools: Bash(dolly:*)
---

Current board:

!`dolly board $ARGUMENTS`

Report it to the user compactly: what's in flight, what waits on human review (`validating`), what's stale. Name the active task. Suggest one next action — no menu of options.
