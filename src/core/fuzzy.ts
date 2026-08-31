/**
 * fzy-style fuzzy matching, hand-rolled — zero dependencies is an invariant,
 * and the scoring core is small enough not to earn one.
 *
 * A needle must appear in the haystack as a subsequence. The score rewards
 * matching at word boundaries and consecutive runs, and penalises gaps, so
 * "oalog" ranks "oauth-login" above "board-alignment".
 *
 * Separator characters in the needle (space, - _ . /) match zero-width: they
 * may stand for a word edge anywhere or vanish entirely. That is what lets a
 * query written the way people talk — "hash ids", "oa log" — find
 * "hash-task-ids" and "oauth-login", where a literal subsequence can never
 * exist because the haystack carries no spaces. Order is still enforced:
 * "daily memo" finds "Daily memo command", "memo daily" does not. A needle
 * made of nothing but separators matches at score 0, which the callers'
 * thresholds read as "no opinion".
 *
 * Returns null when the needle cannot land at all.
 */

const SCORE_MATCH = 16;
/** penalty for starting a gap between matches */
const GAP_START = -3;
/** penalty for each further character inside a gap */
const GAP_EXTENSION = -1;
/** reward for a match that continues the previous one with no gap */
const BONUS_CONSECUTIVE = 4;
/** reward for matching right after a word boundary (- . _ / space) */
const BONUS_BOUNDARY = 7;
/** camelHump and letter↔digit edges read as a boundary, a touch softer */
const BONUS_CAMEL = BONUS_BOUNDARY - 1;

const NEG = -1e9;

/** below this an alignment is noise, not a match — one letter mid-word scores 16 */
export const FUZZY_MIN_SCORE = 30;

/** needle characters that stand for a word edge rather than a literal char */
function isSeparator(ch: string): boolean {
  return /[\s\-._/]/.test(ch);
}

function classOf(ch: string | undefined): 'word' | 'upper' | 'digit' | 'punct' | 'space' {
  if (ch === undefined) return 'space';
  if (/\s/.test(ch)) return 'space';
  if (/[A-Z]/.test(ch)) return 'upper';
  if (/[a-z]/.test(ch)) return 'word';
  if (/[0-9]/.test(ch)) return 'digit';
  return 'punct'; // - . _ / and friends: separators, not word characters
}

/** per-character bonus for haystack position j, from the character before it */
function bonuses(hay: string): number[] {
  const out: number[] = new Array(hay.length).fill(0);
  let prev = classOf(hay[0]);
  out[0] = BONUS_BOUNDARY; // start of string counts as a boundary
  for (let j = 1; j < hay.length; j++) {
    const cur = classOf(hay[j]);
    if (prev === 'space' || prev === 'punct') {
      // a separator before a word character is the word boundary itself
      if (cur !== 'space' && cur !== 'punct') out[j] = BONUS_BOUNDARY;
    } else if (prev === 'word' && cur === 'upper') {
      out[j] = BONUS_CAMEL; // camelHump
    } else if ((prev === 'word' || prev === 'upper') && cur === 'digit') {
      out[j] = BONUS_CAMEL; // v2patch
    } else if (prev === 'digit' && (cur === 'word' || cur === 'upper')) {
      out[j] = BONUS_CAMEL; // ec2instance
    }
    // everything else is mid-word: upper→word is the tail of an acronym run
    // ("XMLHttp…"), word→word is the middle of a word — no bonus either way
    prev = cur;
  }
  return out;
}

/**
 * Best alignment score, or null when the needle cannot land.
 * Both arguments are matched case-sensitively — lowercase before calling.
 */
export function fuzzyScore(needle: string, hay: string): number | null {
  const n = needle.length;
  const m = hay.length;
  if (!n) return 0;
  if (!m) return null;
  // separators consume no haystack, so only the real characters count
  let solid = 0;
  for (let k = 0; k < n; k++) if (!isSeparator(needle[k])) solid++;
  if (solid > m) return null;

  const bonus = bonuses(hay);
  /** best score matching needle[0..i] with needle[i] landing on hay[j] */
  let dp = new Array<number>(m).fill(NEG);

  for (let i = 0; i < n; i++) {
    const next = new Array<number>(m).fill(NEG);
    const sep = isSeparator(needle[i]);
    /**
     * best of the previous row ending strictly before j, with the gap cost
     * already folded in — `acc + SCORE_MATCH` scores a match after a gap
     */
    let acc = NEG;
    for (let j = 0; j < m; j++) {
      if (needle[i] === hay[j]) {
        const gain = SCORE_MATCH + bonus[j];
        if (i === 0) {
          // leading characters are skipped cheaply, but early still wins
          next[j] = gain - j;
        } else {
          let best = acc > NEG / 2 ? acc + gain : NEG;
          if (j > 0 && dp[j - 1] > NEG / 2) {
            // adjacent to the previous needle character: no gap at all
            best = Math.max(best, dp[j - 1] + gain + BONUS_CONSECUTIVE);
          }
          next[j] = best;
        }
      }
      // a separator in the needle may also land on nothing: carry the best
      // score of the previous row straight through (at i=0 the empty prefix
      // is worth 0 at every column)
      if (sep) {
        const carried = i === 0 ? 0 : dp[j];
        if (carried > NEG / 2 && carried > next[j]) next[j] = carried;
      }
      // fold column j into the running gap cost for later columns
      acc = Math.max(acc > NEG / 2 ? acc + GAP_EXTENSION : NEG, dp[j] > NEG / 2 ? dp[j] + GAP_START : NEG);
    }
    dp = next;
  }

  const best = Math.max(...dp);
  return best <= NEG / 2 ? null : best;
}

/**
 * Case-insensitive convenience wrapper used by ref resolution: scores against
 * both the title and the slug and returns whichever aligns better. Accepts
 * multi-word needles — the separators do the word-splitting.
 */
export function fuzzyBest(needle: string, targets: string[]): number | null {
  const n = needle.toLowerCase();
  let best: number | null = null;
  for (const t of targets) {
    const s = fuzzyScore(n, t.toLowerCase());
    if (s !== null && (best === null || s > best)) best = s;
  }
  return best;
}
