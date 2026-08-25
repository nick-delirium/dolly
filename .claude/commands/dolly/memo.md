---
description: Write today's dolly memo — what happened, linked to tasks
argument-hint: "[YYYY-MM-DD]"
allowed-tools: Bash(dolly:*), Write
---

!`dolly memo $ARGUMENTS`

Turn this digest into a short memo of the day — 5-10 lines: what the user worked on, what changed (files), which tasks it belonged to (`<id> <title>` links), anything left hanging.

Then save it:

```
dolly memo --save --file <temp file with your prose>
```

Keep it readable for a human skimming tomorrow. If the digest is empty, say so and stop — an empty memo is noise.
