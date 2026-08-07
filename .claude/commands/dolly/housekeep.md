---
description: Preview and apply dolly housekeeping
argument-hint: "[--apply]"
allowed-tools: Bash(dolly:*)
---

!`dolly housekeep --dry-run`

!`dolly config get housekeep`

Report what would age out. Apply only if the user asked (`dolly housekeep`), otherwise show the preview and ask.

Tune with `dolly config set housekeep.<key> <value>`. Archiving moves tasks to `archive/YYYY-MM/`; nothing is deleted unless `deleteArchivedAfterDays` > 0 or `keepFullStepsPerTask` > 0.
