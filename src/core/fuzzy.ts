/**
 * fzy-style fuzzy matching, hand-rolled — zero dependencies is an invariant,
 * and the scoring core is small enough not to earn one.
 *
 * A needle must appear in the haystack as a subsequence. The score rewards
 * matching at word boundaries and consecutive runs, and penalises gaps, so
 * "oa log" ranks "oauth-login" above "board-alignment". Returns null when the
 * needle is not a subsequence at all.
 */

const SCORE_MATCH = 16;
/** penalty for starting a gap between matches */
const GAP_START = -3;
/** penalty for each further character inside a gap */
const GAP_EXTENSION = -1;
/** reward for a match that continues the previous one with no gap */
const BONUS_CONSECUTIVE = 4;
/** reward for matching right after a word boundary (- . _ / space, digit↔letter) */
const BONUS_BOUNDARY = 7;

const NEG = -1e9;

/** per-character bonus for haystack position j, from the character before it */
function bonuses(hay: string): number[] {
  const out: number[] = new Array(hay.length).fill(0);
  let prevClass = classOf(hay[0]);
  out[0] = BONUS_BOUNDARY; // start of string counts as a boundary
  for (let j = 1; j < hay.length; j++) {
    const cls = classOf(hay[j]);
    if (cls !== prevClass) {
      const camel = prevClass === 'lower' && cls === 'upper';
      out[j] = camel ? BONUS_BOUNDARY - 1 : cls === 'word' ? BONUS_BOUNDARY : 0;
    }
    prevClass = cls;
  }
  return out;
}

function classOf(ch: string | undefined): 'word' | 'lower' | 'upper' | 'punct' | 'space' {
  if (ch === undefined) return 'space';
  if (/\s/.test(ch)) return 'space';
  if (/[A-Z]/.test(ch)) return 'upper';
  if (/[a-z0-9_]/.test(ch)) return 'word';
  return 'punct';
}

/**
 * Best alignment score, or null when the needle is not a subsequence.
 * Both arguments are matched case-sensitively — lowercase before calling.
 */
export function fuzzyScore(needle: string, hay: string): number | null {
  const n = needle.length;
  const m = hay.length;
  if (!n) return 0;
  if (!m || n > m) return null;

  const bonus = bonuses(hay);
  /** best score matching needle[0..i] with needle[i] landing on hay[j] */
  let dp = new Array<number>(m).fill(NEG);

  for (let i = 0; i < n; i++) {
    const next = new Array<number>(m).fill(NEG);
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
 * both the title and the slug and returns whichever aligns better.
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
