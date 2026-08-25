---
description: Hand a finished dolly task to the human for verification
argument-hint: "[ref] (default: current)"
allowed-tools: Bash(dolly:*), Bash(git:*), Read
---

!`dolly show ${ARGUMENTS:-current} 2>&1 | head -30`

Walk the Success Criteria one by one: is each met, and what proves it (test name, command output, file:line)? Anything unmet — say so plainly and do not move the task.

Then log a final step, and:

```
dolly status ${ARGUMENTS:-current} validating --note "<exact steps for the human to check>"
```

Tell the user what to check, in order, with commands they can paste. Stop there — `done` is theirs.
