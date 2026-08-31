<!-- dolly steps · task r5mf9dsr · append-only, newest at the bottom -->
# Full step context — Fix post-release review findings: dispatch fall-through, fuzzy gaps, memo date/file bugs

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0002 -->
## 0002 · 2026-08-30T16:19:30Z · @nick.delirium

- task status: working
- files: `src/cli.ts`, `src/core/fuzzy.ts`, `src/core/memo.ts`, `src/core/store.ts`, `src/prompt.ts`, `tests/fuzzy.test.mjs`, `tests/picker.test.mjs`

# Fuzzy matcher rewrite — how it works now (step 0002 detail)

## Root cause of "spaces never match"

`fuzzyScore` required the needle to be a strict subsequence of the hay. Titles and
slugs never contain spaces, so ANY multi-word query (`hash ids`, `oa log`) returned
null — always, by construction. Not a tuning problem; the feature was unreachable
for its main use case.

## The fix: zero-width separators (in `fuzzyScore`, not in callers)

Separator chars in the NEEDLE (space `- _ . /`) may land on nothing — they carry the
previous row's best score straight through the DP (`next[j] = dp[j]`, and `0` on row
i=0). Consequences:

- `hash ids` ≡ `hash-ids` ≡ `hashids` all find `hash-task-ids`; `oa log` finds
  `oauth-login` (the header doc example is finally true).
- Word ORDER is still enforced: `memo daily` finds nothing on "Daily memo command"
  (the terms must appear in the query's order). This is stricter and more correct
  than splitting into a term conjunction, which would lose order.
- `n > m` early-exit became `solid > m` where solid = non-separator needle chars,
  otherwise `'a b c d e f g h'` (15 chars) would false-reject on an 8-char hay.
- All-separator needles score ~0; the 30 threshold (`FUZZY_MIN_SCORE`, now exported
  from fuzzy.ts) reads that as "no opinion", so single-letter noise behavior is
  unchanged.

No caller changes were needed for multi-word support: `store.search` still calls
`fuzzyBest(ref, [title, slug])`; the picker's live filter now uses the same matcher
when substring filtering finds nothing.

## Bonus table fixes (upper→lower, `_`, digits)

Old `bonuses()` gave full BONUS_BOUNDARY to upper→word transitions — the middle of
an acronym tail (`t` in `XMLHttp`) — because lowercase and `_`/digits shared one
'word' class. New table: separator→word = 7, word→upper camel hump = 6, letter↔digit
= 6 (both directions), `_` moved to punct (so `_` is a real boundary in hay, as the
doc always claimed), upper→word = 0.

## Memo fixes

- **Timezone**: log stamps are UTC (`nowIso` → toISOString) but memo days are local
  (git `--since T00:00:00` and conversation `onDate` are local). `stampLocalDate()`
  now converts UTC stamps to the local calendar date before comparing; a step at
  23:30Z belongs to tomorrow in Berlin, matching its commits.
- **Files trailers**: `filesTouchedToday` used to grab every backticked token in the
  whole log block (`spec.md` from "previous version kept in `spec.md`") and leaked
  `steps.md#0007` anchors. It now reads only `  files:` trailer lines and skips
  `#`-anchored tokens. STAMP regex needs the `m` flag for multi-line block matches —
  without it `$` never matches and files silently vanish (caught by smoke test).
- **Session scan**: `.slice(0, 20)` newest-by-mtime meant backfilling an older day
  found nothing. Now filters `mtime >= local midnight of date` (sound: a file last
  touched before the day can't hold a turn from it), cap 100.

## Non-obvious

- `dolly install opencode` confirmed the committed `.opencode/plugins/dolly.js` is
  byte-identical to the generator — the "2-byte drift" from the first review was an
  artifact of my hand-rolled template decoder (`\{` in a template literal IS `{`).
- `search(ref, tasks = this.loadTasks())` — resolve() passes its already-loaded
  array, killing the double disk read; direct callers keep the old signature.
- Tests pinned exact DP scores twice and were wrong both times (`- j` leading
  penalty); the fix is position-controlled comparisons, not exact numbers.
<!-- /dolly:step 0002 -->
