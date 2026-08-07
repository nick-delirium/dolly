---
description: Rehydrate a dolly task before continuing it
argument-hint: "[ref] (default: current)"
allowed-tools: Bash(dolly:*)
---

!`dolly context ${ARGUMENTS:-current}`

Read all of it, then follow the **dolly** skill. In short: say where the work stands in 3-5 lines, check the tree against the last step's files, move the task to `working` if it is not, and continue.

Do not re-plan what the log already decided. Do not repeat a dead end it records.
