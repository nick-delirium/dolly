/**
 * Dreams: the agent "sleeps" on recent work and writes down what it means.
 *
 * Step notes are written mid-task, one slice at a time; nothing ever steps
 * back to ask what the last day of work added up to — which decision held,
 * what went wrong twice, which idea is still floating. A dream does. dolly
 * gathers everything since the last dream (task events, agent-written step
 * notes, spec changes, plan answers, commits, the human's own prompts) and the
 * rules; the agent — in a subagent where it can, so none of it lands in the
 * working conversation — writes the prose; `--save` stores it.
 *
 * Three rules keep it honest and cheap:
 *  - dolly writes no prose and needs no model, as everywhere else;
 *  - dream files are append-only: a second dream on one day is a second block;
 *  - the project brief is the ONE curated facts file, and a dream may only
 *    append to its Lessons section. Every other change to the brief is a
 *    proposal the save echoes back for a human to apply — a summary written
 *    out of sight must not quietly rewrite the Invariants every session reads.
 *
 * By default a session sees one line about dreams. Everything else is on
 * demand: `dolly dream show`, `dolly recall`.
 */
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { exists, isDir, listFiles, readTextOr, writeText } from './fsx.js';
import { allBlocks, appendBlock, getSection } from './md.js';
import { projectDigest, readProject, setProjectSection } from './project.js';
import { parseLog } from './related.js';
import { compactStep } from './render.js';
import type { Store } from './store.js';
import { plan, stepEntries } from './task.js';
import { listSessions, parseTranscript } from './transcript.js';
import type { Task } from './types.js';

export const DREAMS_DIR = 'dreams';
/** the material an agent is handed; past this, the least useful parts go first */
export const MATERIAL_CAP = 40_000;
/** a first dream, or one after a long gap, looks back this far by default */
const DEFAULT_WINDOW_H = 24;
/** a dream never reaches further back than this unless `--since` says so */
const MAX_WINDOW_D = 14;
/** the brief section dreams may append to */
export const LESSONS = 'Lessons';

export function dreamsDir(store: Store): string {
  return path.join(store.root, DREAMS_DIR);
}

/* --------------------------------- dates --------------------------------- */

const pad = (n: number) => String(n).padStart(2, '0');

/** local calendar date of an instant — dreams are filed by the day you lived */
export function localDay(iso: string | number = Date.now()): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ISO-8601 week of a YYYY-MM-DD date: `2026-W47`. Week 1 holds the year's first Thursday. */
export function isoWeek(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow); // the Thursday of this week decides its year
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return `${year}-W${pad(week)}`;
}

const WEEK = /^(\d{4})-W(\d{2})$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** "3d", "12h", "2w" or an ISO date/time → epoch ms */
export function parseSinceArg(raw: string, now = Date.now()): number {
  const rel = /^(\d+)\s*([hdw])$/i.exec(raw.trim());
  if (rel) {
    const unit = { h: 3_600_000, d: 86_400_000, w: 7 * 86_400_000 }[rel[2].toLowerCase() as 'h' | 'd' | 'w'];
    return now - Number(rel[1]) * unit;
  }
  const t = Date.parse(DAY.test(raw.trim()) ? `${raw.trim()}T00:00:00` : raw.trim());
  if (!Number.isFinite(t)) throw new Error(`--since takes 3d, 12h, 2w or a date, not "${raw}"`);
  return t;
}

/* ------------------------------ reading dreams --------------------------- */

export interface Dream {
  /** `2026-11-20` or `2026-W47` */
  period: string;
  kind: 'day' | 'week';
  file: string;
  /** the instant the dream covers up to — also its block id */
  through: string;
  from: string;
  by: string;
  /** the prose, headings under the block's own */
  body: string;
}

function readFileDreams(file: string, period: string): Dream[] {
  const kind = WEEK.test(period) ? 'week' : 'day';
  return allBlocks(readTextOr(file), 'dream').map((b) => {
    const covers = /^- covers: (\S+) → (\S+)/m.exec(b.text);
    return {
      period,
      kind,
      file,
      through: covers?.[2] ?? b.id,
      from: covers?.[1] ?? '',
      by: /^## .*· @(\S+)/m.exec(b.text)?.[1] ?? '',
      body: b.text,
    };
  });
}

/** every dream, oldest first */
export function listDreams(store: Store): Dream[] {
  const dir = dreamsDir(store);
  if (!isDir(dir)) return [];
  const out: Dream[] = [];
  for (const name of listFiles(dir)) {
    const period = name.replace(/\.md$/, '');
    if (!name.endsWith('.md') || !(DAY.test(period) || WEEK.test(period))) continue;
    out.push(...readFileDreams(path.join(dir, name), period));
  }
  return out.sort((a, b) => a.through.localeCompare(b.through));
}

/** the newest day dream: where the next one starts */
export function lastDayDream(store: Store): Dream | null {
  return listDreams(store).filter((d) => d.kind === 'day').pop() ?? null;
}

/** bullets under a `### <name>` heading in a dream's prose */
export function sectionBullets(prose: string, name: RegExp): string[] {
  const lines = prose.split('\n');
  const out: string[] = [];
  let on = false;
  for (const l of lines) {
    const h = /^#{2,4}\s+(.+?)\s*$/.exec(l);
    if (h) {
      on = name.test(h[1]);
      continue;
    }
    if (!on) continue;
    const b = /^\s*[-*]\s+(.+)$/.exec(l);
    if (b && b[1].trim() && !/^_?none_?\.?$/i.test(b[1].trim())) out.push(b[1].trim());
  }
  return out;
}

const LESSONS_HEADING = /^lessons?\b/i;
const PROPOSALS_HEADING = /^proposed brief edits?\b/i;

/* ------------------------------- the material ---------------------------- */

interface Piece {
  /** lower goes first when the cap bites */
  priority: number;
  text: string;
}

function stampMs(at: string): number {
  // log stamps: `2026-11-20 08:43Z`; step headers: full ISO
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?Z$/.exec(at.trim());
  return m ? Date.parse(`${m[1]}T${m[2]}:${m[3] ?? '00'}Z`) : Date.parse(at);
}

/**
 * Inside the window. Log stamps carry minutes only, so the lower bound is the
 * minute the last dream was saved in: an event in that minute may be shown
 * twice, never dropped.
 */
function within(at: string, fromMs: number, toMs: number): boolean {
  const t = stampMs(at);
  return Number.isFinite(t) && t >= Math.floor(fromMs / 60_000) * 60_000 && t <= toMs;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const demote = (md: string) => md.replace(/^(#{1,4}) /gm, '#$1 ');

function taskPieces(task: Task, fromMs: number, toMs: number): Piece[] {
  const m = task.meta;
  const events = parseLog(task).filter((e) => within(e.at, fromMs, toMs));
  const steps = stepEntries(task.dir).filter((s) => {
    const at = /^## \d+ · (\S+)/m.exec(s.text)?.[1];
    return at ? within(at, fromMs, toMs) : false;
  });
  const qa = qaPairs(task).filter((q) => within(q.at, fromMs, toMs));
  if (!events.length && !steps.length && !qa.length) return [];

  const head = [`### ${m.id} · ${m.title} (${m.status})`, ''];
  for (const e of events) head.push(`- \`${e.at}\` @${e.user}: ${clip(e.text, 300)}`);
  for (const q of qa) head.push(`- plan answer: **${clip(q.q, 200)}** → ${clip(q.a, 400)}`);
  const out: Piece[] = [{ priority: 0, text: head.join('\n') }];
  for (const s of steps) {
    // the agent's own handoff note is the richest thing here; an auto-logged
    // turn is a transcript lift, worth a glance at most
    const auto = /^- source: /m.test(s.text) || /_Auto-logged/.test(s.text);
    const body = auto ? clip(compactStep(s.text), 600) : clip(s.text, 2500);
    out.push({ priority: auto ? 3 : 1, text: demote(demote(body)) });
  }
  return out;
}

function qaPairs(task: Task): { at: string; q: string; a: string }[] {
  const out: { at: string; q: string; a: string }[] = [];
  const re = /\*\*Q \(([^)]+)\):\*\*\s*([\s\S]*?)\n\s*\*\*A:\*\*\s*([\s\S]*?)(?=\n\s*\*\*Q \(|\n## |$)/g;
  for (const m of plan(task).matchAll(re)) out.push({ at: m[1], q: m[2].trim(), a: m[3].trim() });
  return out;
}

function commitsBetween(cwd: string, fromMs: number, toMs: number): string[] {
  const res = spawnSync(
    'git',
    ['log', '--all', `--since=${new Date(fromMs).toISOString()}`, `--until=${new Date(toMs).toISOString()}`, '--format=%h %s (@%an)'],
    { cwd, encoding: 'utf8' },
  );
  if (res.status !== 0 || !res.stdout) return [];
  return res.stdout.split('\n').filter(Boolean).slice(0, 40).map((l) => clip(l, 160));
}

/** what the human actually asked, per conversation — where most ideas live */
function promptsBetween(project: string, fromMs: number, toMs: number): string[] {
  const out: string[] = [];
  try {
    for (const ref of listSessions(project).filter((r) => r.mtime >= fromMs).slice(0, 30)) {
      try {
        const t = parseTranscript(ref);
        const segs = t.segments.filter((s) => within(s.at, fromMs, toMs));
        if (!segs.length) continue;
        out.push(`- session ${t.sessionId.slice(0, 8)} · ${segs.length} turn(s)`);
        for (const s of segs.slice(0, 8)) {
          const first = s.prompt.split('\n').find((l) => l.trim()) ?? '';
          if (first) out.push(`  > ${clip(first.trim(), 220)}`);
        }
      } catch {
        /* unreadable transcript — skip it */
      }
    }
  } catch {
    /* no transcripts at all */
  }
  return out;
}

const DAY_RULES = [
  'You are consolidating, not logging. Write what this stretch of work MEANT, for an agent or human who was not there.',
  'Shape, each heading only if it has content:',
  '`### What happened` (3-8 bullets, outcomes not activity) · `### Decisions` (what was decided and why) · `### Went wrong` (mistakes, dead ends, surprises — and what caught them) · `### Went well` (what to repeat) · `### Ideas and open threads` (floated but not done, unanswered questions) · `### Lessons` · `### Proposed brief edits`',
  '`### Lessons`: only durable rules a future task should follow, phrased as a rule ("Run X before Y — Z broke when we didn\'t"). They are APPENDED to the brief\'s Lessons section on save — skip any the brief already has. Usually 0-2.',
  '`### Proposed brief edits`: other brief changes that this work made true or false ("Invariants: add …", "Architecture: `foo.ts` no longer …", "Lessons: merge the two lock bullets"). Never applied by you or by dolly — the save prints them and a human decides.',
  'Cite task ids (`h2snm7k7`) and step numbers where a reader should dig. Paths, flags, commands exact. Aim for under 3KB.',
];

const WEEK_RULES = [
  'Roll this week\'s day dreams into one note. Keep what is still TRUE and still matters; drop what was superseded later in the week.',
  'Shape: `### What the week did` · `### Decisions that held` · `### Went wrong` · `### Went well` · `### Still open` · `### Lessons` · `### Proposed brief edits` — Lessons and proposals work as in a day dream.',
  'Under 3KB. Cite task ids.',
];

export interface Material {
  text: string;
  through: string;
  from: string;
  /** tasks with activity in the window */
  tasks: string[];
  /** bytes dropped to fit the cap */
  cut: number;
}

function assemble(head: string[], pieces: Piece[], tail: string[], cap: number): { text: string; cut: number } {
  let size = [...head, ...tail].join('\n').length;
  const keep = new Set<Piece>();
  // fill in priority order; within one priority, newest-first is what the
  // caller ordered — so a cut drops the oldest auto-logged turns first
  for (const p of [...pieces].sort((a, b) => a.priority - b.priority)) {
    if (size + p.text.length + 2 > cap && p.priority > 0) continue;
    keep.add(p);
    size += p.text.length + 2;
  }
  const cut = pieces.filter((p) => !keep.has(p)).reduce((n, p) => n + p.text.length, 0);
  const body = pieces.filter((p) => keep.has(p)).map((p) => p.text);
  return { text: [...head, ...body.flatMap((b) => ['', b]), ...tail].join('\n'), cut };
}

/** everything since the last dream, plus the brief and the rules */
export function dayMaterial(store: Store, opts: { since?: string; now?: number; cap?: number } = {}): Material {
  const now = opts.now ?? Date.now();
  const through = new Date(Math.floor(now / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const last = lastDayDream(store);
  let fromMs = opts.since
    ? parseSinceArg(opts.since, now)
    : last
      ? Date.parse(last.through)
      : now - DEFAULT_WINDOW_H * 3_600_000;
  let note = '';
  if (!opts.since && now - fromMs > MAX_WINDOW_D * 86_400_000) {
    fromMs = now - MAX_WINDOW_D * 86_400_000;
    note = `_The last dream is older than ${MAX_WINDOW_D} days; this covers the last ${MAX_WINDOW_D}. Older work: \`--since <date>\`._`;
  }
  const from = new Date(fromMs).toISOString().replace(/\.\d{3}Z$/, 'Z');

  const tasks = store.loadTasks();
  const pieces: Piece[] = [];
  const active: string[] = [];
  for (const t of tasks) {
    const p = taskPieces(t, fromMs, now);
    if (p.length) {
      active.push(t.meta.id);
      pieces.push(...p);
    }
  }
  const commits = commitsBetween(store.project, fromMs, now);
  const prompts = promptsBetween(store.project, fromMs, now);

  const brief = projectDigest(store);
  const prev = last ? clip(last.body.replace(/^## .*\n(- covers:.*\n)?/, '').trim(), 1500) : '';
  const head = [
    `# Dream · ${from} → ${through}`,
    '',
    `${active.length} task(s) with activity, ${commits.length} commit(s). Write the dream, then save it:`,
    '',
    `\`dolly dream --save --through ${through} --file <dream.md>\` (\`--file -\` reads stdin)`,
    '',
    ...(note ? [note, ''] : []),
    '## Rules',
    '',
    ...DAY_RULES.map((r) => `- ${r}`),
    '',
    '## The project brief now (the one facts file — propose, never rewrite)',
    '',
    brief ? demote(brief) : '_empty — Lessons and proposals start it_',
    ...(prev ? ['', '## The previous dream (carry open threads forward or close them)', '', demote(demote(prev))] : []),
    '',
    '## What happened since',
  ];
  if (!pieces.length) pieces.push({ priority: 0, text: '_No task activity in this window._' });
  const tail = [
    '',
    '## Commits',
    '',
    ...(commits.length ? commits.map((c) => `- ${c}`) : ['_none_']),
    '',
    '## What the human asked (first line of each prompt)',
    '',
    ...(prompts.length ? prompts : ['_no transcripts found_']),
  ];
  const { text, cut } = assemble(head, pieces, tail, opts.cap ?? MATERIAL_CAP);
  const out = cut ? `${text}\n\n_${cut} bytes of step bodies (auto-logged first) left out to stay under ${(opts.cap ?? MATERIAL_CAP) / 1000}KB — \`dolly context <id> -n 0\` has them._` : text;
  return { text: out, through, from, tasks: active, cut };
}

/** the week a weekly dream should cover by default: the last finished one with day dreams but no week file */
export function dueWeek(store: Store, now = Date.now()): string | null {
  const thisWeek = isoWeek(localDay(now));
  const dreams = listDreams(store);
  const rolled = new Set(dreams.filter((d) => d.kind === 'week').map((d) => d.period));
  const weeks = [...new Set(dreams.filter((d) => d.kind === 'day').map((d) => isoWeek(d.period)))].sort();
  return weeks.filter((w) => w < thisWeek && !rolled.has(w)).pop() ?? null;
}

export function weekMaterial(store: Store, week: string, opts: { now?: number } = {}): Material {
  if (!WEEK.test(week)) throw new Error(`a week looks like 2026-W47, not "${week}"`);
  const now = opts.now ?? Date.now();
  const through = new Date(Math.floor(now / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const days = listDreams(store).filter((d) => d.kind === 'day' && isoWeek(d.period) === week);
  if (!days.length) throw new Error(`no day dreams in ${week} — nothing to roll up`);
  const head = [
    `# Week dream · ${week}`,
    '',
    `${days.length} day dream(s). Write the week, then save it:`,
    '',
    `\`dolly dream --week ${week} --save --through ${through} --file <week.md>\``,
    '',
    '## Rules',
    '',
    ...WEEK_RULES.map((r) => `- ${r}`),
    '',
    '## The project brief now',
    '',
    demote(projectDigest(store)) || '_empty_',
    '',
    '## The day dreams',
  ];
  const pieces = days.map((d) => ({ priority: 0, text: demote(d.body) }));
  const { text } = assemble(head, pieces, [], Number.MAX_SAFE_INTEGER);
  return { text, through, from: days[0].from, tasks: [], cut: 0 };
}

/* --------------------------------- saving -------------------------------- */

export interface Saved {
  file: string;
  period: string;
  lessons: string[];
  proposals: string[];
}

function fileHeader(period: string): string {
  return `<!-- dolly dreams · ${period} · append-only, newest at the bottom -->\n# Dreams · ${period}\n`;
}

/**
 * Append the dream, then append its Lessons to the brief — and nothing else.
 * `through` is required: re-planning the window at save time would claim
 * events logged after the material was printed, which the prose never saw.
 */
export function saveDream(store: Store, prose: string, opts: { through: string; week?: string }): Saved {
  const body = prose.trim();
  if (!body) throw new Error('refusing to save an empty dream');
  const throughMs = Date.parse(opts.through ?? '');
  if (!opts.through || !Number.isFinite(throughMs)) {
    throw new Error('saving a dream needs --through: the stamp the material printed in its save command');
  }
  const through = new Date(throughMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
  let period: string;
  let from: string;
  if (opts.week) {
    if (!WEEK.test(opts.week)) throw new Error(`a week looks like 2026-W47, not "${opts.week}"`);
    period = opts.week;
    from = listDreams(store).find((d) => d.kind === 'day' && isoWeek(d.period) === period)?.from ?? '';
  } else {
    const last = lastDayDream(store);
    if (last && Date.parse(last.through) >= throughMs) {
      throw new Error(`a dream saved at ${last.through} already covers up to ${through} — print fresh material with \`dolly dream\``);
    }
    period = localDay(throughMs);
    from = last?.through ?? new Date(throughMs - DEFAULT_WINDOW_H * 3_600_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  const file = path.join(dreamsDir(store), `${period}.md`);
  const hhmm = new Date(throughMs).toISOString().slice(11, 16);
  const block = [
    `## ${opts.week ? 'Week' : 'Dream'} · ${opts.week ? period : `${period} ${hhmm}Z`} · @${store.user}`,
    `- covers: ${from || '?'} → ${through}`,
    '',
    // the dream's own headings sit under the block's `##`: lift `#`/`##` to `###`, leave deeper ones be
    body.replace(/^#{1,2} /gm, '### '),
  ].join('\n');
  const src = exists(file) ? readTextOr(file) : fileHeader(period);
  writeText(file, appendBlock(src, `dream ${through}`, block));

  const lessons = appendLessons(store, sectionBullets(body, LESSONS_HEADING));
  return { file, period, lessons, proposals: sectionBullets(body, PROPOSALS_HEADING) };
}

/** append lessons the brief does not already state; returns the ones added */
function appendLessons(store: Store, lessons: string[]): string[] {
  if (!lessons.length) return [];
  const src = readProject(store);
  const current = (src ? getSection(src, LESSONS) : null) ?? '';
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const have = new Set(
    current
      .split('\n')
      .map((l) => /^\s*[-*]\s+(.+)$/.exec(l)?.[1])
      .filter((x): x is string => Boolean(x))
      .map(norm),
  );
  const added = lessons.filter((l) => !have.has(norm(l)));
  if (!added.length) return [];
  const kept = current
    .split('\n')
    .filter((l) => l.trim() && !/^_TBD_$/.test(l.trim()));
  setProjectSection(store, LESSONS, [...kept, ...added.map((l) => `- ${l}`)].join('\n'));
  return added;
}

/* ------------------------------- the nudge ------------------------------- */

/**
 * The ONE session-start line about dreams, or '' when there is nothing worth
 * a line. Due = work happened after the last dream, and that dream (or the
 * oldest undreamt work) is more than a day old.
 */
export function dreamLine(store: Store, tasks: Task[], now = Date.now()): string {
  const last = lastDayDream(store);
  const lastMs = last ? Date.parse(last.through) : 0;
  let newest = 0;
  let oldestSince = Infinity;
  for (const t of tasks) {
    for (const e of parseLog(t)) {
      const ms = stampMs(e.at);
      if (!Number.isFinite(ms) || ms <= lastMs) continue;
      newest = Math.max(newest, ms);
      oldestSince = Math.min(oldestSince, ms);
    }
  }
  const due = newest > 0 && (last ? now - lastMs > 86_400_000 : now - oldestSince > 20 * 3_600_000);
  const week = dueWeek(store, now);
  const nudge = store.config.dream?.nudge !== false;
  const parts: string[] = [];
  if (last) {
    const days = Math.floor((now - lastMs) / 86_400_000);
    const n = sectionBullets(last.body, PROPOSALS_HEADING).length;
    parts.push(`Last dream ${days ? `${days}d ago` : 'today'}${n ? ` (${n} brief edit${n === 1 ? '' : 's'} proposed)` : ''} — \`dolly dream show\`.`);
  }
  if (nudge && (due || week)) {
    const what = [due ? 'undreamt work' : '', week ? `week ${week} not rolled up` : ''].filter(Boolean).join(', ');
    parts.push(`${what[0].toUpperCase()}${what.slice(1)}: at a natural stop, \`/dolly:dream\` (or \`dolly dream${due ? '' : ` --week ${week}`}\` in a subagent).`);
  }
  return parts.join(' ');
}
