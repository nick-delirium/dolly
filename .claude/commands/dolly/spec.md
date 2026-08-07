---
description: Update a dolly task spec, keeping the old version in the same file
argument-hint: "[ref] <what changed>"
allowed-tools: Bash(dolly:*), Read, Write
---

Spec change requested: **$ARGUMENTS**

!`dolly show ${1:-current} --full 2>&1 | head -50`

Follow the **dolly** skill. Write the new full spec to a temp file keeping every section the old one had, then:

```
dolly spec ${1:-current} --short "<2-5 lines>" --file <temp file> --reason "<why it changed>"
```

If the change invalidates work already logged, log a step saying what needs redoing.
