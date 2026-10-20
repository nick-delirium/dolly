/**
 * Full-text recall over everything a store remembers, derived on demand.
 *
 * Decisions live in prose — step notes, superseded specs, planning answers,
 * memos — and nothing else in dolly searches it: refs match titles, `related`
 * matches recorded files. Nothing is persisted: every query reads the markdown
 * as it is now, so a hit's `path:line` cannot be stale and the store stays the
 * only source of truth. BM25 is hand-rolled because zero dependencies is an
 * invariant and the ranking core is small.
 */
import path from 'node:path';
import { listDigests } from './digest.js';
import { isDir, listFiles, readTextOr } from './fsx.js';
import { fileLog, type FileCommit } from './git.js';
import { memoDir } from './memo.js';
import { projectFile } from './project.js';
import { parseLog, type LogEntry } from './related.js';
import { Store, byRecency, readProjectIndex } from './store.js';
import { compactedFile, normalizeFiles, planFile, specFile, stepEntries, stepsFile, taskFile } from './task.js';
import type { Task } from './types.js';

export type RecallKind = 'task' | 'log' | 'step' | 'spec' | 'plan' | 'memo' | 'project' | 'digest';
/** what `--kind` accepts: the unit kinds, plus `decision` which cuts across them */
export const RECALL_KINDS = ['task', 'log', 'step', 'spec', 'plan', 'memo', 'project', 'digest', 'decision'] as const;
/** a rolled-up body still answers, below the rollup that replaced it */
const COMPACTED_WEIGHT = 0.6;
/** a digest is the area's overview: it should surface before its fragments */
const DIGEST_WEIGHT = 1.2;

/** one searchable slice of a file: a section, a log entry, a Q&A pair */
interface Unit {
  kind: RecallKind;
  store: Store;
  task: Task | null;
  file: string;
  /** 1-based line number of lines[0] */
  line: number;
  lines: string[];
  /** where in the file: `step 0003`, `spec v2 (superseded)`, `Invariants` */
  label: string;
  heading: string;
  files: string[];
  at: string;
  /** below 1 for material that is no longer current */
  weight: number;
  /** a section someone wrote to record a choice, or a planning answer */
  decision: boolean;
}

export interface RecallHit {
  kind: RecallKind;
  label: string;
  heading: string;
  file: string;
  line: number;
  snippet: string;
  score: number;
  at: string;
  decision: boolean;
  task: Task | null;
  store: Store;
}

export interface RecallOpts {
  kinds?: string[];
  status?: string;
  /** ISO date or timestamp; units older than this are skipped */
  since?: string;
  taskId?: string;
  limit?: number;
}

export interface RecallResult {
  hits: RecallHit[];
  /** matching units; exact under the limit, counted before de-duplication past it */
  total: number;
  /** query term → the vocabulary term it was corrected to */
  fuzzy: Record<string, string>;
  /** stores that could not be read, with why */
  skipped: { root: string; reason: string }[];
}

/* -------------------------------- tokens --------------------------------- */

/**
 * Function words only. related.ts keeps its own list for title overlap, where
 * "add" and "fix" are noise; here they can be exactly what someone looks for.
 */
const STOP = new Set([
  'the', 'an', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'with', 'is', 'be', 'as', 'at', 'by',
  'it', 'its', 'this', 'that', 'from', 'into', 'via', 'are', 'was', 'were', 'not', 'no', 'but',
  'if', 'then', 'so', 'do', 'does', 'we', 'you', 'they', 'there', 'than', 'has', 'have', 'had',
]);

/** a word, or a compound of words joined by . _ / - (a path, a slug, a flag) */
const WORD = /[\p{L}\p{N}]+(?:[._/-][\p{L}\p{N}]+)*/gu;
const WORD_ASCII = /[a-z0-9]+(?:[._/-][a-z0-9]+)*/g;

function undouble(w: string): string {
  return /([^aeiouls])\1$/.test(w) ? w.slice(0, -1) : w;
}

/**
 * Light suffix stripping. Not linguistics — query and corpus go through the
 * same function, so all it has to do is send "locks", "locked" and "locking"
 * to one term without merging unrelated words.
 */
export function stem(w: string): string {
  if (w.length <= 3 || /\d/.test(w)) return w;
  let s = w;
  if (s.endsWith('ies') && s.length > 4) s = `${s.slice(0, -3)}y`;
  else if (s.endsWith('ing') && s.length > 5) s = undouble(s.slice(0, -3));
  else if (s.endsWith('ed') && s.length > 4) s = undouble(s.slice(0, -2));
  else if (/(sses|xes|zes|ches|shes)$/.test(s)) s = s.slice(0, -2);
  else if (s.endsWith('s') && !/(ss|us|is)$/.test(s)) s = s.slice(0, -1);
  // "string" → "str": a stem with no vowel left was never a suffix
  return /[aeiouy]/.test(s) && s.length >= 3 ? s : w;
}

function pushWord(w: string, out: string[]): void {
  if (w.length < 2 || STOP.has(w)) return;
  out.push(stem(w));
}

/**
 * Terms of a text. A compound is kept whole (so `src/core/lock.ts` can match
 * exactly), with its basename and each part as well (so "lock" still finds it).
 */
export function tokenize(text: string, out: string[] = []): string[] {
  const lower = text.toLowerCase();
  // the Unicode classes cost ~2x; nearly every line of a store is plain ASCII
  for (const m of lower.matchAll(/^[\x00-\x7f]*$/.test(lower) ? WORD_ASCII : WORD)) {
    const raw = m[0];
    if (!/[._/-]/.test(raw)) {
      pushWord(raw, out);
      continue;
    }
    out.push(raw);
    if (raw.includes('/')) out.push(raw.slice(raw.lastIndexOf('/') + 1));
    for (const part of raw.split(/[._/-]+/)) pushWord(part, out);
  }
  return out;
}

/** one word of the query as typed: its own term plus, for a compound, its parts */
interface Group {
  word: string;
  terms: Map<string, number>;
}

interface Query {
  groups: Group[];
  phrases: string[];
}

export function parseQuery(q: string): Query {
  const phrases: string[] = [];
  const rest = q.replace(/"([^"]+)"/g, (_, p: string) => {
    phrases.push(p.toLowerCase().trim());
    return ` ${p} `;
  });
  const groups: Group[] = [];
  for (const m of rest.toLowerCase().matchAll(WORD)) {
    const raw = m[0];
    if (groups.some((g) => g.word === raw)) continue;
    const terms = queryTerms(raw);
    if (terms.size) groups.push({ word: raw, terms });
  }
  return { groups, phrases: phrases.filter(Boolean) };
}

/**
 * What one typed word may match, and how much each counts. A path's parts
 * ("src", "core", "ts") are in nearly every step, so a path query matches the
 * path, then its basename, then the bare name — never the directories.
 */
function queryTerms(raw: string): Map<string, number> {
  const terms = new Map<string, number>();
  const put = (t: string, w: number) => {
    if (t && !terms.has(t)) terms.set(t, w);
  };
  if (!/[._/-]/.test(raw)) {
    for (const t of tokenize(raw)) put(t, 1);
    return terms;
  }
  put(raw, 1);
  const base = raw.slice(raw.lastIndexOf('/') + 1);
  const file = /^(.+)\.[\p{L}\p{N}]{1,4}$/u.exec(base);
  if (raw.includes('/') || file) {
    put(base, 0.8);
    for (const t of tokenize((file?.[1] ?? base).replace(/[._-]+/g, ' '))) put(t, 0.3);
    return terms;
  }
  for (const t of tokenize(raw.replace(/[._/-]+/g, ' '))) put(t, 0.5);
  return terms;
}

/* --------------------------------- corpus -------------------------------- */

const DECISION_HEADING = /\b(decisions?|decided|choices?|dead[ -]?ends?|rejected|why|trade-?offs?|chose|gotchas?|alternatives?)\b/i;
/** importer-written sections of an auto-logged step: tool traces, not prose */
const NOISE_HEADING = /^(Work chain|Commands run|Tools)\b/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const MARKER = /^<!--.*-->\s*$/;

function readLines(file: string): string[] | null {
  const raw = readTextOr(file);
  return raw ? raw.split('\n') : null;
}

/** split lines[from, to) into heading-led sections, each a unit */
function sections(
  base: Omit<Unit, 'line' | 'lines' | 'heading' | 'decision'>,
  lines: string[],
  from: number,
  to: number,
  split = /^#{1,6}\s/,
): Unit[] {
  const out: Unit[] = [];
  let start = from;
  const flush = (end: number) => {
    if (end <= start) return;
    const chunk = lines.slice(start, end);
    if (!chunk.some((l) => l.trim() && !MARKER.test(l))) return;
    const heading = HEADING.exec(chunk[0])?.[2]?.trim() ?? '';
    if (NOISE_HEADING.test(heading)) return;
    const decision = DECISION_HEADING.test(heading);
    for (const [at, part] of paragraphs(chunk)) {
      out.push({ ...base, line: start + at + 1, lines: part, heading, decision });
    }
  };
  for (let i = from; i < to; i++) {
    if (i > start && split.test(lines[i])) {
      flush(i);
      start = i;
    }
  }
  flush(to);
  return out;
}

/** a section longer than this is searched in paragraph-sized pieces */
const LONG_SECTION = 14;

/**
 * Cut a long section at blank lines and bullet starts. A 40-line step note is
 * one section, and BM25's length normalisation buries one apt line in it
 * under a short section that merely names the word.
 */
function paragraphs(chunk: string[]): [number, string[]][] {
  if (chunk.length <= LONG_SECTION) return [[0, chunk]];
  const out: [number, string[]][] = [];
  let from = 0;
  for (let i = 1; i <= chunk.length; i++) {
    const size = i - from;
    const edge = i === chunk.length || (size >= 4 && (!chunk[i].trim() || /^\s{0,2}([-*]|\d+\.)\s/.test(chunk[i])));
    if (edge || size >= LONG_SECTION) {
      const part = chunk.slice(from, i);
      if (part.some((l) => l.trim() && !MARKER.test(l))) out.push([from, part]);
      from = i;
    }
  }
  return out;
}

function backticked(s: string): string[] {
  return [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
}

function logStamp(s: string): string {
  // `2026-09-29 14:26Z` → sortable ISO
  return s.replace(' ', 'T');
}

function taskUnits(store: Store, task: Task): Unit[] {
  const out: Unit[] = [];
  const base = { store, task, files: [] as string[], at: task.meta.updated, weight: 1 };

  const tmd = readLines(taskFile(task.dir));
  if (tmd) {
    // skip frontmatter: the title is in the `# ` heading, the rest is metadata
    let i = 0;
    if (tmd[0] === '---') {
      i = 1;
      while (i < tmd.length && tmd[i] !== '---') i++;
      i++;
    }
    for (const u of sections({ ...base, kind: 'task', file: taskFile(task.dir), label: 'task' }, tmd, i, tmd.length, /^##?\s/)) {
      if (/^Full Context$/.test(u.heading)) continue;
      if (u.heading !== 'Log') {
        if (/^#\s/.test(u.lines[0])) u.heading = task.meta.title;
        out.push(u);
        continue;
      }
      // the log: one unit per entry, with the files and stamp it carries
      let cur: Unit | null = null;
      u.lines.forEach((l, k) => {
        const m = /^- `([^`]*)`\s*@\S+?:/.exec(l);
        if (m) {
          cur = { ...base, kind: 'log', file: u.file, label: 'log', line: u.line + k, lines: [l], heading: '', files: [], at: logStamp(m[1]), decision: false };
          out.push(cur);
        } else if (cur && /^\s+\S/.test(l)) {
          cur.lines.push(l);
          const files = /files:\s*(.+?)(?:\s*·\s*full:|$)/.exec(l)?.[1];
          if (files) cur.files.push(...backticked(files));
        } else cur = null;
      });
    }
  }

  const steps = readLines(stepsFile(task.dir));
  if (steps) out.push(...stepUnits(base, steps, stepsFile(task.dir), 1));
  const moved = readLines(compactedFile(task.dir));
  if (moved) out.push(...stepUnits(base, moved, compactedFile(task.dir), COMPACTED_WEIGHT, ' (compacted)'));

  const spec = readLines(specFile(task.dir));
  if (spec) {
    let label = '';
    let weight = 1;
    let from = -1;
    const flush = (to: number) => {
      if (from >= 0) out.push(...sections({ ...base, kind: 'spec', file: specFile(task.dir), label, weight }, spec, from, to));
      from = -1;
    };
    spec.forEach((l, k) => {
      if (/^<!--\s*dolly:spec-current\s*-->/.test(l)) {
        label = `spec v${task.meta.spec_version}`;
        weight = 1;
        from = k + 1;
      } else if (/^<!--\s*dolly:spec-history\s*-->/.test(l)) {
        weight = 0.5;
      } else if (/^<!--\s*\/dolly:spec-(current|history)\s*-->/.test(l)) {
        flush(k);
      } else if (weight === 0.5 && /^## v(\d+) — /.test(l)) {
        flush(k);
        label = `spec v${/^## v(\d+)/.exec(l)![1]} (superseded)`;
        from = k;
      }
    });
  }

  const plan = readLines(planFile(task.dir));
  if (plan) {
    for (const u of sections({ ...base, kind: 'plan', file: planFile(task.dir), label: 'plan' }, plan, 0, plan.length, /^##\s/)) {
      if (u.heading !== 'Q&A') {
        out.push(u);
        continue;
      }
      // every answered question is a decision someone made on purpose
      const pairs = sections({ ...base, kind: 'plan', file: u.file, label: 'plan Q&A' }, plan, u.line, u.line - 1 + u.lines.length, /^\*\*Q\b/);
      for (const p of pairs) {
        p.heading = p.lines[0].replace(/^\*\*Q[^*]*\*\*\s*/, '').trim();
        p.decision = true;
        out.push(p);
      }
    }
  }
  return out;
}

/** step blocks of a steps file; `weight` < 1 marks material already rolled up */
function stepUnits(
  base: Omit<Unit, 'kind' | 'file' | 'label' | 'line' | 'lines' | 'heading' | 'decision'>,
  lines: string[],
  file: string,
  weight: number,
  suffix = '',
): Unit[] {
  const out: Unit[] = [];
  let from = -1;
  let id = '';
  lines.forEach((l, k) => {
    const open = /^<!--\s*dolly:(step|rollup)\s+(\S+?)\s*-->/.exec(l);
    if (open) {
      from = k + 1;
      id = `${open[1]} ${open[2]}${suffix}`;
      return;
    }
    if (from < 0 || !/^<!--\s*\/dolly:(step|rollup)\s/.test(l)) return;
    const block = lines.slice(from, k);
    const head = /^## \S+ · (\S+)/.exec(block[0] ?? '');
    const files = backticked(block.find((b) => /^- files:/.test(b)) ?? '');
    const units = sections({ ...base, kind: 'step', file, label: id, files: [], at: head?.[1] ?? base.at, weight }, lines, from, k);
    // the block's own `## NNNN · stamp` line and its `- files:` bullets are
    // metadata, not prose: a hit on them says nothing the log does not
    const first = units[0];
    if (first && /^\d{4} · /.test(first.heading)) {
      let skip = 0;
      while (skip < first.lines.length && /^(## \d{4} · |- (task status|files|source|covers|moved):|\s*$)/.test(first.lines[skip])) skip++;
      first.lines = first.lines.slice(skip);
      first.line += skip;
      first.heading = '';
      if (!first.lines.some((l) => l.trim() && !MARKER.test(l))) units.shift();
    }
    // the files belong to the step once, not to every section of its note
    if (units[0]) units[0].files = files;
    out.push(...units);
    from = -1;
  });
  return out;
}

function storeUnits(store: Store): Unit[] {
  const out: Unit[] = [];
  for (const task of store.loadTasks()) out.push(...taskUnits(store, task));
  const base = { store, task: null, files: [] as string[], weight: 1 };

  const proj = readLines(projectFile(store));
  if (proj) {
    out.push(...sections({ ...base, kind: 'project', file: projectFile(store), label: 'project brief', at: '' }, proj, 0, proj.length, /^##\s/));
  }
  for (const d of listDigests(store)) {
    const lines = readLines(d.file);
    if (!lines) continue;
    // the live prose ranks above its own history
    const cur = lines.findIndex((l) => /^<!--\s*dolly:digest\s*-->/.test(l));
    const end = lines.findIndex((l) => /^<!--\s*\/dolly:digest\s*-->/.test(l));
    const hist = lines.findIndex((l) => /^<!--\s*dolly:digest-history\s*-->/.test(l));
    const base2 = { ...base, kind: 'digest' as const, file: d.file, at: d.updated };
    if (cur >= 0 && end > cur) {
      out.push(...sections({ ...base2, label: `digest ${d.slug}`, weight: DIGEST_WEIGHT }, lines, cur + 1, end));
    }
    if (hist >= 0) {
      const hend = lines.findIndex((l, i) => i > hist && /^<!--\s*\/dolly:digest-history\s*-->/.test(l));
      out.push(...sections({ ...base2, label: `digest ${d.slug} (superseded)`, weight: 0.5 }, lines, hist + 1, hend > hist ? hend : lines.length));
    }
  }
  const memos = memoDir(store.root);
  if (isDir(memos)) {
    for (const name of listFiles(memos).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))) {
      const file = path.join(memos, name);
      const lines = readLines(file);
      const date = name.slice(0, 10);
      if (lines) out.push(...sections({ ...base, kind: 'memo', file, label: `memo ${date}`, at: date }, lines, 0, lines.length, /^##\s/));
    }
  }
  return out;
}

/* --------------------------------- ranking ------------------------------- */

const K1 = 1.2;
const B = 0.75;

function unitTokens(u: Unit): string[] {
  const out: string[] = [];
  for (const l of u.lines) if (!MARKER.test(l)) tokenize(l, out);
  // a heading is what the section is about: count it twice
  if (u.heading) tokenize(u.heading, out);
  for (const f of u.files) tokenize(f, out);
  return out;
}

interface Scored {
  unit: Unit;
  score: number;
}

function score(units: Unit[], q: Query): { scored: Scored[]; df: Map<string, number> } {
  const want = new Map<string, number>();
  for (const g of q.groups) for (const [t, w] of g.terms) want.set(t, Math.max(want.get(t) ?? 0, w));
  const tfs: Map<string, number>[] = [];
  const lens: number[] = [];
  const df = new Map<string, number>();
  let total = 0;
  for (const u of units) {
    const toks = unitTokens(u);
    const tf = new Map<string, number>();
    for (const t of toks) if (want.has(t)) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    tfs.push(tf);
    lens.push(toks.length);
    total += toks.length;
  }
  const n = units.length;
  const avg = n ? total / n : 1;
  const now = Date.now();
  const titles = new Map<string, Set<string>>();
  const inTitle = (task: Task): boolean => {
    let toks = titles.get(task.meta.id);
    if (!toks) titles.set(task.meta.id, (toks = new Set(tokenize(task.meta.title))));
    return q.groups.some((g) => [...g.terms.keys()].some((t) => toks!.has(t)));
  };
  const scored: Scored[] = [];
  units.forEach((u, i) => {
    const tf = tfs[i];
    if (!tf.size) return;
    let s = 0;
    let groupsHit = 0;
    for (const g of q.groups) {
      let hit = false;
      for (const [t, w] of g.terms) {
        const f = tf.get(t);
        if (!f) continue;
        hit = true;
        const d = df.get(t) ?? 0;
        const idf = Math.log(1 + (n - d + 0.5) / (d + 0.5));
        s += w * idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * lens[i]) / avg)));
      }
      if (hit) groupsHit++;
    }
    if (!s) return;
    // all of the query in one place beats a lot of one word
    s *= 0.4 + (0.6 * groupsHit) / q.groups.length;
    if (q.phrases.length) {
      const text = u.lines.join('\n').toLowerCase();
      if (q.phrases.some((p) => text.includes(p))) s *= 1.5;
    }
    if (u.task && inTitle(u.task)) s *= 1.15;
    const t = Date.parse(u.at);
    if (Number.isFinite(t)) s *= 1 + 0.15 * Math.exp(-(now - t) / (60 * 86_400_000));
    scored.push({ unit: u, score: s * u.weight });
  });
  return { scored, df };
}

/** optimal string alignment distance, cut off past `max` */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1);
      d[i][j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/**
 * A query word nothing contains is most likely a typo. Fuzzy subsequence
 * matching (fuzzy.ts) cannot fix a transposition — "compactoin" is not a
 * subsequence of "compaction" — so this is edit distance over the corpus's own
 * vocabulary, preferring the closest and then the most common term.
 */
function correct(units: Unit[], q: Query, df: Map<string, number>): Record<string, string> {
  const dead = q.groups.filter((g) => ![...g.terms.keys()].some((t) => df.has(t)));
  if (!dead.length) return {};
  const vocab = new Map<string, number>();
  for (const u of units) for (const t of new Set(unitTokens(u))) vocab.set(t, (vocab.get(t) ?? 0) + 1);
  const fixed: Record<string, string> = {};
  for (const g of dead) {
    const term = [...g.terms.keys()][0];
    if (term.length < 4 || /[._/-]/.test(term)) continue;
    const max = term.length >= 8 ? 2 : 1;
    let best: { t: string; d: number; n: number } | null = null;
    for (const [t, n] of vocab) {
      if (/[._/-]/.test(t)) continue;
      const d = editDistance(term, t, max);
      if (d > max) continue;
      if (!best || d < best.d || (d === best.d && n > best.n)) best = { t, d, n };
    }
    if (best) {
      g.terms.set(best.t, 1);
      fixed[g.word] = best.t;
    }
  }
  return fixed;
}

/* --------------------------------- snippet ------------------------------- */

function snippetOf(u: Unit, q: Query, max = 160): { line: number; text: string } {
  let best = -1;
  let bestHits = 0;
  u.lines.forEach((l, k) => {
    if (!l.trim() || MARKER.test(l)) return;
    const toks = new Set(tokenize(l));
    // weighted, so the line naming `src/core/lock.ts` beats one saying "lock"
    let hits = 0;
    for (const g of q.groups) {
      let w = 0;
      for (const [t, tw] of g.terms) if (tw > w && toks.has(t)) w = tw;
      hits += w;
    }
    if (q.phrases.some((p) => l.toLowerCase().includes(p))) hits += 1;
    if (hits > bestHits) {
      best = k;
      bestHits = hits;
    }
  });
  // matched only through the recorded files or the heading: point at the start
  if (best < 0) best = Math.max(0, u.lines.findIndex((l) => l.trim() && !MARKER.test(l)));
  let text = u.lines[best].trim();
  if (text.length > max) {
    const lower = text.toLowerCase();
    const at = Math.max(
      0,
      Math.min(...q.groups.map((g) => lower.indexOf(g.word.slice(0, Math.max(3, g.word.length - 2)))).filter((i) => i >= 0), text.length),
    );
    const start = Math.max(0, Math.min(at - 50, text.length - max));
    text = `${start > 0 ? '…' : ''}${text.slice(start, start + max).trim()}${start + max < text.length ? '…' : ''}`;
  }
  return { line: u.line + best, text };
}

/* ---------------------------------- api ---------------------------------- */

/** `30d`, `2w`, `6m` or a date → ISO lower bound */
export function parseSince(s: string, now = Date.now()): string {
  const rel = /^(\d+)([dwm])$/.exec(s.trim());
  if (rel) {
    const days = Number(rel[1]) * { d: 1, w: 7, m: 30 }[rel[2] as 'd' | 'w' | 'm'];
    return new Date(now - days * 86_400_000).toISOString();
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s.trim()) && Number.isFinite(Date.parse(s.trim()))) return s.trim();
  throw new Error(`--since takes 30d, 2w, 6m or YYYY-MM-DD, not "${s}"`);
}

function keep(u: Unit, opts: RecallOpts): boolean {
  if (opts.kinds?.length) {
    const ok = opts.kinds.some((k) => (k === 'decision' ? u.decision : u.kind === k));
    if (!ok) return false;
  }
  if (opts.status && u.task?.meta.status !== opts.status) return false;
  if (opts.taskId && u.task?.meta.id !== opts.taskId) return false;
  if (opts.since && (!u.at || u.at < opts.since)) return false;
  return true;
}

/** every store dolly knows, this one first; unreadable ones are reported, never fatal */
export function knownStores(current: Store | null): { stores: Store[]; skipped: RecallResult['skipped'] } {
  const stores: Store[] = current ? [current] : [];
  const skipped: RecallResult['skipped'] = [];
  const seen = new Set(stores.map((s) => path.resolve(s.root)));
  for (const e of Object.values(readProjectIndex())) {
    const root = path.resolve(e.store);
    if (seen.has(root)) continue;
    seen.add(root);
    if (!isDir(root)) {
      skipped.push({ root, reason: 'store directory is gone' });
      continue;
    }
    try {
      stores.push(new Store({ root, project: e.path, kind: e.local ? 'repo' : 'global' }));
    } catch (err) {
      skipped.push({ root, reason: (err as Error).message });
    }
  }
  return { stores, skipped };
}

export function recall(stores: Store[], query: string, opts: RecallOpts = {}): RecallResult {
  const q = parseQuery(query);
  const skipped: RecallResult['skipped'] = [];
  if (!q.groups.length) return { hits: [], total: 0, fuzzy: {}, skipped };
  if (opts.kinds) {
    const bad = opts.kinds.filter((k) => !(RECALL_KINDS as readonly string[]).includes(k));
    if (bad.length) throw new Error(`unknown --kind ${bad.join(', ')} — one of ${RECALL_KINDS.join(', ')}`);
  }
  const units: Unit[] = [];
  for (const s of stores) {
    try {
      units.push(...storeUnits(s));
    } catch (err) {
      skipped.push({ root: s.root, reason: (err as Error).message });
    }
  }
  // idf comes from the whole corpus; filters only decide what is shown
  let { scored, df } = score(units, q);
  const fuzzy = correct(units, q, df);
  if (Object.keys(fuzzy).length) ({ scored } = score(units, q));

  scored = scored.filter((s) => keep(s.unit, opts)).sort((a, b) => b.score - a.score);
  const limit = opts.limit && opts.limit > 0 ? opts.limit : Infinity;
  const hits: RecallHit[] = [];
  const seen = new Set<string>();
  for (const { unit: u, score: sc } of scored) {
    // snippets cost a tokenize per line: only build the ones that are shown
    if (hits.length >= limit) break;
    const snip = snippetOf(u, q);
    // a finalized plan is the spec again; the same line twice is one hit
    const key = `${u.store.root}|${u.task?.meta.id ?? u.file}|${snip.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({
      kind: u.kind,
      label: u.label,
      heading: u.heading,
      file: u.file,
      line: snip.line,
      snippet: snip.text,
      score: Math.round(sc * 1000) / 1000,
      at: u.at,
      decision: u.decision,
      task: u.task,
      store: u.store,
    });
  }
  // counted before de-duplication: an estimate past the limit, exact under it
  const total = hits.length < limit ? hits.length : scored.length;
  return { hits, total, fuzzy, skipped };
}

/* ------------------------------ derived links ---------------------------- */

export interface Mention {
  task: Task;
  file: string;
  line: number;
  text: string;
}

/**
 * Tasks whose own files mention this task's id — the backlinks nobody had to
 * write. Only real ids, as whole words, so prose cannot fake one.
 */
export function mentionedBy(store: Store, task: Task, tasks = store.loadTasks()): Mention[] {
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${task.meta.id}(?![\\p{L}\\p{N}])`, 'u');
  const out: Mention[] = [];
  for (const other of [...tasks].sort(byRecency)) {
    if (other.meta.id === task.meta.id) continue;
    for (const file of [taskFile(other.dir), stepsFile(other.dir), specFile(other.dir), planFile(other.dir), compactedFile(other.dir)]) {
      const lines = readLines(file);
      const k = lines?.findIndex((l) => re.test(l)) ?? -1;
      if (k < 0) continue;
      out.push({ task: other, file, line: k + 1, text: lines![k].trim() });
      break;
    }
  }
  return out;
}

export interface WhyReport {
  file: string;
  /** tasks whose steps recorded the file, newest work first */
  touched: { task: Task; entries: LogEntry[] }[];
  commits: (FileCommit & { tasks: string[] })[];
  /** prose naming the file outside those step records */
  prose: RecallHit[];
}

/**
 * "Who changed this, and why" for one file: the steps that recorded it, the
 * commits that touched it mapped back to tasks, and prose that names it.
 * A commit maps through a `Dolly-Task: <id>` trailer, or a known id anywhere
 * in its message — never through timing or file overlap guesses.
 */
export function why(store: Store, file: string): WhyReport {
  const rel = normalizeFiles(store.project, [file])[0] ?? file;
  const tasks = store.loadTasks();
  const touched: WhyReport['touched'] = [];
  for (const task of tasks) {
    const log = parseLog(task).filter((e) => e.kind === 'step');
    // a log line names LOG_FILES files then "+N more"; the step block has them all
    const blocks = new Set(
      stepEntries(task.dir, { compacted: true })
        .filter((b) => backticked(/^- files:.*$/m.exec(b.text)?.[0] ?? '').includes(rel))
        .map((b) => b.id),
    );
    const entries = log.filter((e) => e.files.includes(rel) || (e.ref !== undefined && blocks.has(e.ref)));
    if (entries.length) touched.push({ task, entries });
  }
  const newest = (t: WhyReport['touched'][number]) => t.entries[t.entries.length - 1].at;
  touched.sort((a, b) => (newest(a) < newest(b) ? 1 : -1));

  const ids = new Set(tasks.map((t) => t.meta.id));
  const commits = fileLog(store.project, rel).map((c) => {
    const found = new Set<string>();
    for (const m of c.body.matchAll(/^Dolly-Task:\s*(.+)$/gim)) {
      for (const id of m[1].split(/[\s,]+/)) if (id) found.add(id);
    }
    for (const m of `${c.subject}\n${c.body}`.matchAll(/(?<![\p{L}\p{N}])[\p{L}\p{N}]{8}(?![\p{L}\p{N}])/gu)) {
      if (ids.has(m[0])) found.add(m[0]);
    }
    return { ...c, tasks: [...found] };
  });

  const base = path.posix.basename(rel).toLowerCase();
  const prose = recall([store], rel, { kinds: ['task', 'step', 'spec', 'plan', 'memo', 'project', 'digest'] })
    .hits.filter((h) => h.snippet.toLowerCase().includes(base) && !/^- files:/.test(h.snippet))
    .slice(0, 5);
  return { file: rel, touched, commits, prose };
}

export interface Similar {
  task: Task;
  words: string[];
}

/**
 * Tasks whose prose — not just their title — already covers most of a new
 * title's words. A hint to look before duplicating, never a verdict.
 */
export function similarTasks(store: Store, title: string, excludeId?: string, max = 5): Similar[] {
  const q = parseQuery(title);
  if (q.groups.length < 2) return [];
  const units = storeUnits(store).filter((u) => u.task && u.task.meta.id !== excludeId);
  const best = new Map<string, Similar & { score: number }>();
  for (const { unit: u, score: s } of score(units, q).scored) {
    const toks = new Set(unitTokens(u));
    const words = q.groups.filter((g) => [...g.terms.keys()].some((t) => toks.has(t))).map((g) => g.word);
    if (words.length < Math.max(2, Math.ceil(q.groups.length * 0.6))) continue;
    const id = u.task!.meta.id;
    const cur = best.get(id);
    if (!cur || s > cur.score) best.set(id, { task: u.task!, words, score: s });
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, max);
}
