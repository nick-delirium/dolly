---
description: Preview and apply dolly housekeeping
argument-hint: "[--apply]"
allowed-tools: Bash(dolly:*)
---

!`dolly housekeep --dry-run`

Config:

!`dolly config get housekeep`

Report what would age out. Then:

- User said `--apply`, or asked to run it → `dolly housekeep`.
- Otherwise show the preview and ask.

Something ages out too soon or too late → tune it, e.g. `dolly config set housekeep.archiveDoneAfterDays 30`. Keys: `archiveDoneAfterDays`, `staleAfterDays`, `deleteArchivedAfterDays`, `keepFullStepsPerTask`, `keepSpecVersions`, `auto`, `autoEveryHours`.

Archiving moves a task to `archive/YYYY-MM/` — nothing is deleted unless `deleteArchivedAfterDays` > 0. Pruning removes only full step context files; the short summaries in `task.md` survive.
