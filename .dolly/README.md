# .dolly — shared task memory

Written and read by coding agents via the `dolly` CLI (`npm i -g dolly`).
Commit this directory: it is how the next session — yours or a teammate's —
knows what was decided and why.

- `tasks/NNNN-slug/task.md` — short spec, success criteria, and a one-line-per-event
  log. Start here. Every line is stamped with the GitHub handle of whoever did it.
- `tasks/NNNN-slug/context/spec.md` — current full spec at the top, every
  superseded version below it under "Superseded versions".
- `tasks/NNNN-slug/context/steps.md` — full context of each step, append-only:
  decisions, rejected options, gotchas, what to do next.
- `tasks/NNNN-slug/context/plan.md` — the planning interview, when there was one.
- `archive/YYYY-MM/` — tasks aged out by `dolly housekeep`.

Read with `dolly board`, `dolly show <ref>`, `dolly context <ref>`.
Do not hand-edit these files — the CLI maintains frontmatter, spec versions and
step counters.
