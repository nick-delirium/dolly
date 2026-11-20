---
description: Dream — consolidate recent work into a dream note and lessons for the brief
argument-hint: "[--since 3d] | --week [YYYY-Www]"
allowed-tools: Bash(dolly:*), Write, Agent, Task
---

Dreaming reads a lot of material (up to ~40KB). Keep it out of this conversation: hand the whole job to a subagent (Agent/Task tool) with this prompt, and wait for it. No subagent tool? Do the steps yourself.

> Run `dolly dream $ARGUMENTS`. Follow the rules it prints exactly: write the dream to a temp file, then save it with the exact `dolly dream --save --through … --file <file>` command it printed. Never run `dolly project set` — brief changes other than Lessons are proposals. Reply with ONLY the save command's output.

Then tell the user, in two or three lines: where the dream was saved, which Lessons were appended to the brief, and every **proposed brief edit** — those are theirs to accept (`dolly project set "<Section>" --text "..."`) or drop.
