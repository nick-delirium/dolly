<!-- dolly steps · task 6qp6wxbq · append-only, newest at the bottom -->
# Full step context — Add zcode as an install target: workspace files + plugin-carried hooks

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001 -->
## 0001 · 2026-09-01T07:21:02Z · @nick-delirium

- task status: working
- files: none
- source: session 1db55685-411f-4cb5-8ecf-6c263f7aeb07 · turn f98d473e-6235-4e2d-8f1a-fc954bbf1ecb

## What the agent said it did

I'll review the last two commits.

---

Big diff — 5280 insertions across two commits. Reviewing source, skipping `.dolly/` markdown.

---

Review done. Two commits, ~5.3k insertions. `tsc` clean. **`npm test` is red on main** — details below.

## Blockers

**1. `tests/memo.test.mjs:88` not hermetic — suite fails on any dev machine** `tests/memo.test.mjs:104`

`sandbox()` pins `DOLLY_DIR` but never chdirs, so `store.project` is the **dolly repo root**. Test 1 (line 46) deletes `DOLLY_TRANSCRIPT_DIR`, so `buildDigest` reads the real `~/.claude/projects/-Users-...-dollie/`. Any Claude Code transcript for this repo with today's mtime becomes a second conversation:

```
✖ digest includes mirrored opencode turns from the day
  AssertionError: 2 !== 1
```

`tests/transcript-opencode.test.mjs` avoids this by using a temp cwd. Fix: point `DOLLY_TRANSCRIPT_DIR` at an empty temp dir in that test.

**2. `filterNumbered` hangs forever on empty/EOF stdin** `src/prompt.ts:487`

```ts
if (!raw) continue;   // no exit
```

`select()` (`prompt.ts:260`) returns the default on empty input; this loops. Reachable: `resolveRef` (`cli.ts:308`) gates the picker on `process.stdout.isTTY` only, so `dolly show <ambiguous> < /dev/null` from a terminal → `canRaw` false (stdin not TTY) → `filterNumbered` → busy-spin, timers starved. Verified: process wedged, needed SIGKILL. Fix: gate on `process.stdin.isTTY` too, and make empty input cancel or pick candidate 1.

## Real bugs

**3. `dolly memo` loses `files:` for every multi-line step summary** `src/core/memo.ts:106`

```
/^- `.*?` @.*(?:\n(?:(?!- `).)*)?$/gm
```

No `s` flag, so `.` never crosses a newline — the optional group captures **one** trailer line. `logLine` (`task.ts:112`) puts extra summary lines first and trailers last, so a 2-line summary pushes `files:` to line 3. Verified:

```
BLOCK>>>"- `…` @me: first line\n  second line"     ← files: line never in block
```

CLAUDE.md tells agents to write 1–3 line summaries, so this is the common case. Also the comment "greedy is safe" describes a regex that isn't greedy across lines. Fix: `[\s\S]` or split on `/^- `/m.

**4. `dolly update --check` always fails for npm installs** `src/cli.ts:1495`

Hardcodes `latestFromGitForCheck()` → `git ls-remote origin` with `cwd = PKG_ROOT`. `installKind()` returns `package` precisely when PKG_ROOT has no `.git`, so the command errors → null → `"could not reach the remote to compare"`, always. `runUpdateCheck` (`update.ts:186`) branches on kind correctly; `cmdUpdate` doesn't. That's the population the notice sends here.

## Low

- `store.ts:756` — `String(front.id ?? dirId ?? base)`. `dirId` is `''`, not `undefined`, when the regex fails, so `?? base` is dead and the id becomes `''`. Same dead branch on `dirSlug`. Only bites a hand-edited dir, but it's the opposite of what's written.
- `store.ts:657` — `t.rel.toLowerCase().includes(needle)` scores 3500; `rel` carries the `tasks/` prefix, so `dolly show tasks` is ambiguous against the whole board.
- `cli.ts:476` — `const all = bool(args, 'all')` now unused, but CLAUDE.md, `skills/dolly/SKILL.md`, README and the session-start hook text all still teach `dolly board --all`. Harmless, just dead.
- `prompt.ts:429` — `i` isn't reset when `query` changes; `draw()` only clamps, so the highlight lands on an arbitrary row after typing.

Not flagged: `npm --prefix root install` does rebuild (`prepare` → `build`), so `planUpdate`'s comment is accurate.

Want me to fix 1–4?

## Work chain

- Bash: git log -3 --stat --oneline | head -80
- Bash: git diff HEAD~2 --stat
- Bash: git diff HEAD~2 -- src/core/fuzzy.ts src/core/store.ts | head -450
- Bash: git diff HEAD~2 --stat -- src/ tests/ && echo "---TOTAL---" && git diff HEAD~2 -- src/ | w
- Bash: git diff HEAD~2 -- src/core/memo.ts src/core/selfupdate.ts src/core/session.ts src/core/tr
- Bash: git diff HEAD~2 -- src/core/task.ts src/core/types.ts src/core/render.ts src/core/related.
- Bash: grep -n "logLine\|files:\|full:" /Users/nikitamelnikov/Documents/proj/dollie/src/core/task
- Bash: sed -n 105,160p /Users/nikitamelnikov/Documents/proj/dollie/src/core/task.ts; echo "=== st
- Bash: grep -n "Log$\|^- \`" -m 20 /Users/nikitamelnikov/Documents/proj/dollie/.dolly/tasks/xb925
- Bash: git diff HEAD~2 -- src/migrate.ts
- Bash: sed -n 380,445p /Users/nikitamelnikov/Documents/proj/dollie/src/migrate.ts
- Bash: git diff HEAD~2 -- src/prompt.ts
- Bash: grep -n "line()" -A 12 /Users/nikitamelnikov/Documents/proj/dollie/src/prompt.ts | sed -n 
- Bash: git diff HEAD~2 -- src/cli.ts | head -600
- Bash: git diff HEAD~2 -- src/cli.ts | sed -n 600,900p
- Bash: sed -n 1315,1345p /Users/nikitamelnikov/Documents/proj/dollie/src/cli.ts
- Bash: cat /Users/nikitamelnikov/Documents/proj/dollie/package.json
- Bash: git diff HEAD~2 -- src/install.ts | head -420
- Bash: git diff HEAD~2 -- src/install.ts | sed -n 420,720p
- Bash: npx tsc -p tsconfig.json --noEmit 2>&1 | tail -20
- Bash: node --test tests/*.test.mjs 2>&1 | tail -25
- Bash: npm test 2>&1 | grep -E "^(# (pass|fail|tests)|✖|not ok)" | head -40
- Bash: npm test 2>&1 | grep -E "^# (pass|fail|tests|todo|skipped)"
- Bash: npm test 2>&1 | sed -n '/digest includes mirrored opencode turns/,/^$/p' | head -40
- Bash: node --test tests/memo.test.mjs 2>&1 | sed -n '/digest includes mirrored/,/^ *}/p' | head 
- Bash: sed -n 1,80p /Users/nikitamelnikov/Documents/proj/dollie/tests/transcript-opencode.test.mj
- Bash: sed -n 85,125p /Users/nikitamelnikov/Documents/proj/dollie/tests/memo.test.mjs
- Bash: node --test tests/transcript-opencode.test.mjs tests/update.test.mjs 2>&1 | grep -E "^(✔|✖
- Bash: sed -n 100,130p /Users/nikitamelnikov/Documents/proj/dollie/src/core/transcript.ts
- Bash: sed -n 1,60p /Users/nikitamelnikov/Documents/proj/dollie/tests/memo.test.mjs
- Bash: cat > /private/tmp/claude-501/-Users-nikitamelnikov-Documents-proj-dollie/1db55685-411f-4c
- Bash: sed -n 1,40p tests/helpers.mjs
- Bash: ls -la ~/.claude/projects/-Users-nikitamelnikov-Documents-proj-dollie/*.jsonl 2>/dev/null 
- Bash: const block = [
- Bash: cat > /private/tmp/claude-501/-Users-nikitamelnikov-Documents-proj-dollie/1db55685-411f-4c
- Bash: sed -n 56,72p src/prompt.ts; echo ---; sed -n 136,160p src/prompt.ts
- Bash: grep -n "export function linkSession" -A 12 src/core/task.ts
- Bash: grep -n "installKind\|latestFromNpm\|function latestFromGit" -n src/core/update.ts | head 
- Bash: sed -n 120,200p src/core/update.ts
- Bash: grep -n "const all = bool" -A 3 src/cli.ts; echo "--- help ---"; grep -n "board \[" src/cl

## Commands run

- `git log -3 --stat --oneline | head -80`
- `git diff HEAD~2 --stat`
- `git diff HEAD~2 -- src/core/fuzzy.ts src/core/store.ts | head -450`
- `git diff HEAD~2 --stat -- src/ tests/ && echo "---TOTAL---" && git diff HEAD~2 -- src/ | wc -l`
- `git diff HEAD~2 -- src/core/memo.ts src/core/selfupdate.ts src/core/session.ts src/core/transcript.ts | head -700`
- `git diff HEAD~2 -- src/core/task.ts src/core/types.ts src/core/render.ts src/core/related.ts src/core/update.ts src/reindex.ts`
- `grep -n "logLine\|files:\|full:" /Users/nikitamelnikov/Documents/proj/dollie/src/core/task.ts | head -40`
- `sed -n 105,160p /Users/nikitamelnikov/Documents/proj/dollie/src/core/task.ts; echo "=== step trailers ==="; sed -n 420,445p /Users/nikitamelnikov/Documents/proj`
- `grep -n "Log$\|^- \`" -m 20 /Users/nikitamelnikov/Documents/proj/dollie/.dolly/tasks/xb925jmt-daily-memo-command/task.md | head; echo "=== raw tail ==="; tail -`
- `git diff HEAD~2 -- src/migrate.ts`
- `sed -n 380,445p /Users/nikitamelnikov/Documents/proj/dollie/src/migrate.ts`
- `git diff HEAD~2 -- src/prompt.ts`
- `grep -n "line()" -A 12 /Users/nikitamelnikov/Documents/proj/dollie/src/prompt.ts | sed -n 1,60p`
- `git diff HEAD~2 -- src/cli.ts | head -600`
- `git diff HEAD~2 -- src/cli.ts | sed -n 600,900p`
- `sed -n 1315,1345p /Users/nikitamelnikov/Documents/proj/dollie/src/cli.ts`
- `cat /Users/nikitamelnikov/Documents/proj/dollie/package.json`
- `git diff HEAD~2 -- src/install.ts | head -420`
- `git diff HEAD~2 -- src/install.ts | sed -n 420,720p`
- `npx tsc -p tsconfig.json --noEmit 2>&1 | tail -20`
- `node --test tests/*.test.mjs 2>&1 | tail -25`
- `npm test 2>&1 | grep -E "^(# (pass|fail|tests)|✖|not ok)" | head -40`
- `npm test 2>&1 | grep -E "^# (pass|fail|tests|todo|skipped)"`
- `npm test 2>&1 | sed -n '/digest includes mirrored opencode turns/,/^$/p' | head -40`
- `node --test tests/memo.test.mjs 2>&1 | sed -n '/digest includes mirrored/,/^ *}/p' | head -50`
- `sed -n 1,80p /Users/nikitamelnikov/Documents/proj/dollie/tests/transcript-opencode.test.mjs`
- `sed -n 85,125p /Users/nikitamelnikov/Documents/proj/dollie/tests/memo.test.mjs`
- `node --test tests/transcript-opencode.test.mjs tests/update.test.mjs 2>&1 | grep -E "^(✔|✖|ℹ (pass|fail))"`
- `sed -n 100,130p /Users/nikitamelnikov/Documents/proj/dollie/src/core/transcript.ts`
- `sed -n 1,60p /Users/nikitamelnikov/Documents/proj/dollie/tests/memo.test.mjs`
- `cat > /private/tmp/claude-501/-Users-nikitamelnikov-Documents-proj-dollie/1db55685-411f-4cb5-8ecf-6c263f7aeb07/scratchpad/dbg.mjs <<'EOF'`
- `sed -n 1,40p tests/helpers.mjs`
- `ls -la ~/.claude/projects/-Users-nikitamelnikov-Documents-proj-dollie/*.jsonl 2>/dev/null | tail -3; echo "---"; grep -rn "DOLLY_TRANSCRIPT_DIR" tests/memo.test`
- `const block = [`
- `cat > /private/tmp/claude-501/-Users-nikitamelnikov-Documents-proj-dollie/1db55685-411f-4cb5-8ecf-6c263f7aeb07/scratchpad/pick.mjs <<'EOF'`
- `sed -n 56,72p src/prompt.ts; echo ---; sed -n 136,160p src/prompt.ts`
- `grep -n "export function linkSession" -A 12 src/core/task.ts`
- `grep -n "installKind\|latestFromNpm\|function latestFromGit" -n src/core/update.ts | head -20`
- `sed -n 120,200p src/core/update.ts`
- `grep -n "const all = bool" -A 3 src/cli.ts; echo "--- help ---"; grep -n "board \[" src/cli.ts; echo "--- docs referencing --all ---"; grep -rn "board --all" RE`

## Tools

Bash 40

## Request that opened the turn (verbatim)

can you perform review on two last commits?

---

_Imported by `dolly reindex` from session 1db55685-411f-4cb5-8ecf-6c263f7aeb07, turn f98d473e-6235-4e2d-8f1a-fc954bbf1ecb (2026-09-01T07:13:50.428Z → 2026-09-01T07:21:01.806Z). The summary is lifted from what the agent said, not written by a human. Correct it with a follow-up step if it misleads._
<!-- /dolly:step 0001 -->

<!-- dolly:step 0002 -->
## 0002 · 2026-09-01T07:30:06Z · @nick-delirium

- task status: working
- files: `src/prompt.ts`, `src/cli.ts`, `src/core/memo.ts`, `src/core/update.ts`, `src/core/store.ts`, `tests/memo.test.mjs`, `tests/picker.test.mjs`, `tests/task.test.mjs`
- source: session 1db55685-411f-4cb5-8ecf-6c263f7aeb07 · turn 59206ee3-ed01-4b84-a11a-2ca0b50cb433

## What the agent said it did

Fixing all seven. Starting with `prompt.ts` (hang) and the stdin gate.

---

Now `filterNumbered`'s loop and the highlight reset:

---

Now the `resolveRef` stdin gate in `cli.ts`:

---

Now the memo trailer regex:

---

Now `dolly update --check` for npm installs — `update.ts`:

---

Now wire it into `cmdUpdate`:

---

Now the `store.ts` fallbacks and `search()` ref matching:

---

Now the dead `--all` variable in `cmdBoard`:

---

Now the non-hermetic memo test:

---

Now a regression test for the memo `files:` trailer:

---

Fixes done, suite green (222/222). Logging to dolly:

---

All seven fixed. `tsc` clean, **222/222 green**.

## Blockers

**1. `npm test` red on main** — `tests/memo.test.mjs` `delete`d `DOLLY_TRANSCRIPT_DIR`. `sandbox()` pins the store but never chdirs, so `store.project` is this repo and the digest read your real `~/.claude/projects`. Both memo tests now pin both transcript roots at empty sandbox dirs. Deleting an env var with a real-filesystem default is the opposite of isolation.

**2. Picker hang** — three independent halves, all fixed:
- `prompt.ts` `line()` had no `'end'` handler → EOF promise never resolved. Now tracks `ended` and flushes carry.
- `filterNumbered` looped on `if (!raw) continue`. Now empty → `PromptCancelled`. It can't borrow `select()`'s "empty = default" rule; a disambiguation prompt has no defensible default.
- `resolveRef` gated on `stdout.isTTY` only. Now needs stdin too.

Verified:
```
$ node dist/cli.js show "add" < /dev/null
ambiguous ref "add" — candidates:
  6qp6wxbq Add zcode as an install target…  (working)
  …
dolly: disambiguate by id/hash, or run from an interactive terminal
exit=1
```

**3. `dolly memo` file trailers** — regex now `/^- `[^`]*` @[^\n]*(?:\n[ \t]+[^\n]*)*/gm`: head line plus every *indented* line. Anchoring on indent is exact and still can't swallow the un-indented `### plan finalized` blocks.

**4. `dolly update --check`** — extracted `latestForCheck(kind)` in `update.ts` (registry for a package, tags for a checkout, tags as fallback). `runUpdateCheck` now shares it, so the two can't drift again. `cmdUpdate` is async; dispatch awaits. Output names its source: `dolly 0.1.0 — up to date (git)`.

## Low

- `readTaskDir`: `dirId` falls back to the basename, not `''` — the dead `?? base` tails are gone.
- `search()`: `t.rel.includes()` → `t.meta.id.startsWith()`, which is what that clause was for. `dolly show tasks` now resolves to nothing.
- `filterSelect`: `i = 0` on every query edit.
- `cmdBoard`: dead `all` variable removed. Left `--all` accepted — docs still teach it and the sentence attached to it is still true now that plain `dolly board` shows everything.

Not changed: `npm --prefix root install` does build via `"prepare"`, so `planUpdate`'s comment stands.

## Tests added
EOF cancels + numbered path still works (`picker.test.mjs`); multi-line summary reports files (`memo.test.mjs`); hash-prefix resolves, `tasks` doesn't (`task.test.mjs`).

dolly task `dhhjdz3b` → `validating`. Worth re-running `npm test` on your machine — that's where it was red.

## Work chain

- Bash: sed -n 40,50p tests/memo.test.mjs && echo "=== 85-110 ===" && sed -n 85,112p tests/memo.te
- Bash: sed -n 396,500p src/prompt.ts
- Bash: sed -n 118,185p src/prompt.ts
- Bash: grep -rn "latestFromGitForCheck\|upgradeCommand" src/ tests/
- Edit src/prompt.ts ×5
- Edit src/cli.ts
- Edit src/core/memo.ts
- Edit src/core/update.ts ×2
- Bash: sed -n 176,200p src/core/update.ts
- Edit src/cli.ts ×3
- Edit src/core/store.ts ×2
- Edit src/cli.ts
- Edit tests/memo.test.mjs
- Bash: sed -n 41,90p tests/memo.test.mjs
- Edit tests/memo.test.mjs
- Bash: cat tests/picker.test.mjs
- Edit tests/picker.test.mjs
- Edit tests/memo.test.mjs
- Bash: grep -rln "resolve(" tests/ | head; echo ---; grep -n "resolve" tests/task.test.mjs | head
- Bash: sed -n 165,192p tests/task.test.mjs
- Edit tests/task.test.mjs
- Bash: npm run build 2>&1 | tail -5
- Bash: node --test tests/*.test.mjs 2>&1 | grep -E "^ℹ (tests|pass|fail)|^✖"
- Bash: npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)|^✖"
- Bash: timeout 15 node dist/cli.js show "add" < /dev/null; echo "exit=$?"
- Bash: node dist/cli.js show "add" < /dev/null; echo "exit=$?"
- Bash: node dist/cli.js update --check; echo "exit=$?"; node dist/cli.js memo --date "$(date +%Y-
- Bash: grep -rn -B2 "^  files:" .dolly/tasks/*/task.md | grep -A2 -B0 "@.*: " | head -12
- Bash: git diff --stat
- Bash: git diff src/core/update.ts src/core/store.ts
- Bash: node dist/cli.js related --files src/prompt.ts,src/core/memo.ts,src/core/update.ts,src/cor
- Bash: node dist/cli.js new "Fix review findings on the fuzzy/memo/zcode commits: picker hang, me
- Bash: cat > /private/tmp/claude-501/-Users-nikitamelnikov-Documents-proj-dollie/1db55685-411f-4c
- Bash: node dist/cli.js status dhhjdz3b validating --note "run npm test on your own machine (that

## Files touched

- `src/prompt.ts`
- `src/cli.ts`
- `src/core/memo.ts`
- `src/core/update.ts`
- `src/core/store.ts`
- `tests/memo.test.mjs`
- `tests/picker.test.mjs`
- `tests/task.test.mjs`

## Commands run

- `sed -n 40,50p tests/memo.test.mjs && echo "=== 85-110 ===" && sed -n 85,112p tests/memo.test.mjs && echo "=== 112-165 ===" && sed -n 112,175p tests/memo.test.mj`
- `sed -n 396,500p src/prompt.ts`
- `sed -n 118,185p src/prompt.ts`
- `grep -rn "latestFromGitForCheck\|upgradeCommand" src/ tests/`
- `sed -n 176,200p src/core/update.ts`
- `sed -n 41,90p tests/memo.test.mjs`
- `cat tests/picker.test.mjs`
- `grep -rln "resolve(" tests/ | head; echo ---; grep -n "resolve" tests/task.test.mjs | head -20`
- `sed -n 165,192p tests/task.test.mjs`
- `npm run build 2>&1 | tail -5`
- `node --test tests/*.test.mjs 2>&1 | grep -E "^ℹ (tests|pass|fail)|^✖"`
- `npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)|^✖"`
- `timeout 15 node dist/cli.js show "add" < /dev/null; echo "exit=$?"`
- `node dist/cli.js show "add" < /dev/null; echo "exit=$?"`
- `node dist/cli.js update --check; echo "exit=$?"; node dist/cli.js memo --date "$(date +%Y-%m-%d)" 2>&1 | head -20`
- `grep -rn -B2 "^  files:" .dolly/tasks/*/task.md | grep -A2 -B0 "@.*: " | head -12`
- `git diff --stat`
- `git diff src/core/update.ts src/core/store.ts`
- `node dist/cli.js related --files src/prompt.ts,src/core/memo.ts,src/core/update.ts,src/core/store.ts 2>&1 | head -30`
- `node dist/cli.js new "Fix review findings on the fuzzy/memo/zcode commits: picker hang, memo file trailers, update --check" --short "Review of 9eb5f41 + 701d3d9`
- `cat > /private/tmp/claude-501/-Users-nikitamelnikov-Documents-proj-dollie/1db55685-411f-4cb5-8ecf-6c263f7aeb07/scratchpad/notes.md <<'EOF'`
- `node dist/cli.js status dhhjdz3b validating --note "run npm test on your own machine (that is where it was red); then try: dolly show add < /dev/null should pri`

## Tools

Bash 22, Edit 20

## Request that opened the turn (verbatim)

fix everything please

---

_Imported by `dolly reindex` from session 1db55685-411f-4cb5-8ecf-6c263f7aeb07, turn 59206ee3-ed01-4b84-a11a-2ca0b50cb433 (2026-09-01T07:24:32.295Z → 2026-09-01T07:30:06.749Z). The summary is lifted from what the agent said, not written by a human. Correct it with a follow-up step if it misleads._
<!-- /dolly:step 0002 -->
