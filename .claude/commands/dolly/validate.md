---
description: Hand a finished dolly task to the human for verification
argument-hint: "[ref] (default: current)"
allowed-tools: Bash(dolly:*), Bash(git:*), Read
---

Task:

!`dolly show ${ARGUMENTS:-current} 2>&1 | head -40`

Hand off for human review:

1. Walk the Success Criteria one by one. For each: is it met, and what proves it (test name, command output, file:line)? Anything not met — say so plainly, don't move the task.
2. Log a final step summarising the whole change and how to verify it:

```
dolly step ${ARGUMENTS:-current} -m "<what shipped>" --auto-files --detail-file <verification notes>
```

3. `dolly status ${ARGUMENTS:-current} validating --note "<exact steps for the human to check>"`

4. Tell the user what to check, in order, with commands they can paste.

Stop there. `done` is the human's call, not yours.
