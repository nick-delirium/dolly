---
description: Plan a feature with dolly — interview, then generate the spec
argument-hint: "<what you want to build>"
allowed-tools: Bash(dolly:*), Read, Grep, Glob
---

User wants: **$ARGUMENTS**

Follow the **dolly-planning** skill. Read the repo first — `dolly project`, `dolly related --files <expected files>`, and the code itself — then:

```
dolly plan start "<short title>" --brief "$ARGUMENTS"
dolly plan check <ref>          # your interview agenda
```

Ask the user the open items in ONE batch with concrete options and a recommendation. Record answers with `dolly plan qa`, fill sections with `dolly plan set`, loop until `plan check` passes, then `dolly plan finalize <ref>`.

Never invent an answer. Never write implementation code during planning. Small bounded fix → `dolly new` instead, and say so.
