<!-- dolly steps · task dhhjdz3b · append-only, newest at the bottom -->
# Full step context — Fix review findings on the fuzzy/memo/zcode commits: picker hang, memo file trailers, update --check

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001 -->
## 0001 · 2026-09-01T07:29:47Z · @nick-delirium

- task status: working
- files: `src/cli.ts`, `src/core/memo.ts`, `src/core/store.ts`, `src/core/update.ts`, `src/prompt.ts`, `tests/memo.test.mjs`, `tests/picker.test.mjs`, `tests/task.test.mjs`

Review of the two commits `9eb5f41` (fuzzy/cli/zcode) and `701d3d9` (hash ids, memo, opencode).
Seven defects found, all fixed here. Reading order below is severity, not file order.

## 1. `npm test` was red on main — the memo test was not hermetic

`tests/memo.test.mjs` used `sandbox()`, which pins `DOLLY_DIR` but **never chdirs**. So
`store.project` is the dolly repo root, not the temp dir. The first test then did
`delete process.env.DOLLY_TRANSCRIPT_DIR`, which points `listSessions()` at the real
`~/.claude/projects/-Users-...-dollie/` — i.e. the transcript of whatever Claude Code
session is running the tests. Any session touched today became a second conversation:

    ✖ digest includes mirrored opencode turns from the day
      AssertionError: 2 !== 1

Green in CI, red on every developer machine. `tests/transcript-opencode.test.mjs` dodges
this only because it builds its own temp cwd.

Fix: both memo tests now PIN `DOLLY_TRANSCRIPT_DIR` and `DOLLY_OPENCODE_DIR` at empty
dirs under the sandbox instead of deleting them. Deleting an env var that has a
real-filesystem default is never isolation — it is the opposite.

**Note for the next agent:** `sandbox()` does not isolate cwd. Anything that reads
`store.project` (transcripts, `gitOn`, `related`) will see the actual repo. Pin the roots.

## 2. The numbered ambiguous-ref picker hung forever

`filterNumbered` (`src/prompt.ts`) looped on `if (!raw) continue;`. Two ways to reach it:

- `stdioTerm().raw` is false whenever **stdin** is not a TTY, and `resolveRef` in
  `cli.ts` gated the picker on `process.stdout.isTTY` **only**. So `dolly show <ambiguous>
  < /dev/null` from a terminal opened a prompt nobody could answer.
- `term.line()` had no `'end'` handler, so at EOF its promise never resolved at all.

Verified before the fix: the process wedged, and because the loop awaits an
already-resolved promise it starves the event loop — a `setTimeout` watchdog never even
fired. Needed SIGKILL.

Three-part fix, deliberately belt-and-braces since each half is independently wrong:
- `line()` tracks an `ended` flag and resolves with the flushed carry on `'end'`, so EOF
  surfaces as an empty line instead of a hang. Later `line()` calls short-circuit.
- `filterNumbered` treats an empty line as `PromptCancelled`. It cannot borrow `select()`'s
  "empty means the default" rule — the entire premise of a disambiguation prompt is that
  there is no defensible default.
- `resolveRef` now requires `process.stdin.isTTY` **and** `process.stdout.isTTY`. A picker
  needs somewhere to draw and someone to answer.

## 3. `dolly memo` silently dropped `files:` for multi-line summaries

`filesTouchedToday` in `src/core/memo.ts` used

    /^- `.*?` @.*(?:\n(?:(?!- `).)*)?$/gm

No `s` flag, so `.` never crosses a newline: the optional group captures exactly ONE
following line. `logLine()` (`task.ts:112`) writes continuation lines of the summary
FIRST and trailers LAST, so any 2-line summary pushes `files:` to line 3, out of reach.
CLAUDE.md instructs agents to write 1-3 line summaries, so this was the common case, not
the edge case. The old comment ("greedy is safe") described a regex that was not greedy
across lines at all.

Now `/^- `[^`]*` @[^\n]*(?:\n[ \t]+[^\n]*)*/gm` — head line plus every INDENTED line.
Anchoring on the indent is exact (both continuations and trailers are indented two
spaces) and it still cannot swallow the un-indented `### plan finalized` blocks that sit
inside the Log section.

## 4. `dolly update --check` never worked for npm installs

`cmdUpdate` hardcoded `latestFromGitForCheck()` → `git ls-remote origin` with
`cwd = PKG_ROOT`. But `installKind()` returns `'package'` *precisely when* PKG_ROOT has no
`.git`. So for every npm-installed user the command failed and printed
"could not reach the remote to compare" — and those are exactly the users the passive
update notice sends to `dolly update`.

`runUpdateCheck` already had the correct branching. Extracted it as
`latestForCheck(kind)` (registry for a package, tags for a checkout, tags as the fallback
while dolly is unpublished) and both callers now share it, so they cannot drift again.
`cmdUpdate` became async; dispatch awaits it. The check line now also prints the source
(`git` / `npm`) so a wrong answer is diagnosable.

## 5-7. Smaller

- `readTaskDir` (`store.ts`): `dirId` was `''` — not `undefined` — when the dash test
  failed, so `String(front.id ?? dirId ?? base)` never reached `base` and produced an
  EMPTY id. `dirId` now falls back to the whole basename; the dead `?? base` tails are
  gone from all three fields.
- `Store.search()`: scored `t.rel.toLowerCase().includes(needle)`, and `rel` carries the
  literal `tasks/` segment — so `dolly show tasks` was ambiguous against the entire board.
  Replaced with `t.meta.id.startsWith(needle)`, which is what that clause was actually
  there for (hash-prefix refs like `3pkn`). Regression test in `task.test.mjs`.
- `filterSelect`: `i` was not reset when `query` changed. `draw()` only clamped it, so
  after typing, the highlight landed on an arbitrary row of a freshly-rebuilt list.

## Deliberately NOT changed

- `planUpdate`'s clone path runs `npm --prefix root install` with no explicit build. This
  is correct: package.json has `"prepare": "npm run build"`, which npm runs on install in
  a package directory. The comment is accurate; leave it.
- `--all` on `dolly board` is now inert (archiving is gone) but is still taught by
  CLAUDE.md, `skills/dolly/SKILL.md`, the README and the session-start hook text. The
  sentence those docs attach to it is still TRUE — plain `dolly board` does show
  everything now — so only the dead local variable was removed, and the flag stays
  accepted. Rewriting every generated copy of the docs was out of scope for a bugfix.

## Tests added

`tests/picker.test.mjs` — EOF term cancels rather than looping; the numbered path still
takes a number and re-asks on garbage.
`tests/memo.test.mjs` — a step whose summary spans two lines still reports its files.
`tests/task.test.mjs` — hash-prefix refs resolve; `tasks` resolves to nothing.

222/222 green, `tsc` clean.
<!-- /dolly:step 0001 -->
