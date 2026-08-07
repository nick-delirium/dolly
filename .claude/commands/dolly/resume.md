---
description: Rehydrate a dolly task — full spec, criteria, step log, recent step detail
argument-hint: "[ref] (default: current)"
allowed-tools: Bash(dolly:*)
---

!`dolly context ${ARGUMENTS:-current} -n 5`

Read all of it. Then:

1. Tell the user in 3-5 lines where the work stands: what's done, what's next, any open decision left by the previous session.
2. Check the working tree against the last step's file list — code may have moved since.
3. If the task isn't `working` yet, run `dolly status <ref> working`.
4. Continue the work. Log the next major step with `dolly step <ref> -m "..." --auto-files --detail-file <notes>`.

Do not re-plan work already decided in the step log. Do not repeat a dead end the log records.
