---
description: Attach dolly to this conversation — import what has already happened
argument-hint: "[--apply] [--into ref]"
allowed-tools: Bash(dolly:*), Read, Write
---

!`dolly reindex $ARGUMENTS`

The digest above is the mechanical record of this session. You have the reasoning behind it.

Per the **dolly** skill: `dolly reindex --apply` imports one step per turn (idempotent), then **replace the imported spec** — it is only the raw requests stitched together:

```
dolly spec <ref> --short "<2-5 lines>" --file <spec.md> --reason "reindexed from session <id>"
```

Set the status honestly, then keep logging normally.
