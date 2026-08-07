---
description: Plan a feature with dolly — interview, then generate the spec
argument-hint: "<what you want to build>"
allowed-tools: Bash(dolly:*), Read, Grep, Glob
---

User wants: **$ARGUMENTS**

Run the dolly planning flow. Use the `dolly-planning` skill for the full rules.

1. Grep/read the codebase first — never ask what the code already answers.
2. `dolly plan start "<short title>" --brief "$ARGUMENTS"`
3. `dolly plan check <ref>` → that's your agenda.
4. Ask the user the open items in ONE batch, grouped by section, each with concrete options and your recommendation. Stop and wait.
5. Record answers: `dolly plan qa <ref> -q "..." -a "..."`, fill sections: `dolly plan set <ref> "<Section>" --text "..."`.
6. Loop 3-5 until `dolly plan check` says complete.
7. `dolly plan finalize <ref>` → spec written, status `todo`.

Do not start writing implementation code during planning. Do not invent answers to Open Questions.

If the request is a small bounded fix, skip all this: `dolly new "<title>" --short "<spec>"` and say so.
