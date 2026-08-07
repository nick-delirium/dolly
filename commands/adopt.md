---
description: Attach dolly to this conversation — import what has already happened
argument-hint: "[--apply] [--into ref]"
allowed-tools: Bash(dolly:*), Read, Write
---

This conversation started without dolly. Adopt it.

!`dolly reindex $ARGUMENTS`

The digest above is derived from this session's transcript: every request you were given verbatim, the files you touched and commands you ran per turn, with real timestamps. It is the mechanical record — you have the reasoning that produced it.

Then:

1. `dolly reindex --apply` — imports one step per turn, creates the task. Idempotent: re-running skips turns already imported.
2. **Replace the imported spec.** It is just the raw requests stitched together. Write the real one from what you actually know:

```
dolly spec <ref> --short "<2-5 lines: what this is, what it must do>" \
  --file <full-spec.md> --reason "reindexed from session <id>"
```

3. Fix any imported step whose summary reads like a request rather than an outcome — log a corrective step, don't rewrite history:

```
dolly step <ref> -m "<what actually landed>" --detail-file <notes>
```

4. Set the status honestly: `dolly status <ref> working`, or `validating` if the work is already done and waiting on the user.

From here, log every further step normally — the conversation is now backed by files that survive a context reset.

Re-running after dolly's storage format changes: `dolly reindex --apply --rebuild` re-imports this session from scratch. `dolly migrate` upgrades tasks written by an older dolly.
