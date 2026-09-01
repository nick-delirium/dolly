/**
 * The daily memo. dolly already records everything that happens — task logs,
 * and (via transcripts or the opencode mirror) whole conversations — but it is
 * scattered across tasks. A memo is one file per day: what was worked on, what
 * changed, which tasks it belonged to.
 *
 * The CLI builds the mechanical digest; the agent (or a human) turns it into
 * prose. The CLI never writes the memo itself — like steps, a memo is only
 * ever saved on purpose.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { exists, readTextOr } from './fsx.js';
import { listSessions, parseTranscript } from './transcript.js';
import type { Store } from './store.js';
import { logSection, type Task } from './task.js';

export const MEMO_DIR = 'memo';

export function memoDir(storeRoot: string): string {
  return path.join(storeRoot, MEMO_DIR);
}

export function memoFile(storeRoot: string, date: string): string {
  return path.join(memoDir(storeRoot), `${date}.md`);
}

/** today in local time as YYYY-MM-DD — memos are for the day you are in */
export function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00`));
}

/** local-time date string of an ISO timestamp */
function localDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** does an ISO timestamp fall on the target date, in local time? */
function onDate(iso: string, date: string): boolean {
  return Boolean(iso) && localDate(iso) === date;
}

/* ------------------------------- task events ------------------------------ */

export interface MemoEvent {
  time: string;
  user: string;
  text: string;
}

/** the short-log line format `logLine()` writes: `- `YYYY-MM-DD HH:mmZ` @user: text` */
// `m` so it also matches the head line of a multi-line log block
const STAMP = /^- `(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})(Z?)` @([^:]+): (.*)$/m;

/**
 * Local calendar date of a log stamp. Stamps are UTC (`nowIso()` truncated);
 * memo days are the days you live in, so convert — a step logged at 23:30Z
 * belongs to tomorrow in Berlin. A stamp without the Z is already local.
 */
export function stampLocalDate(day: string, time: string): string {
  const iso = /Z$/.test(time) ? `${day}T${time.slice(0, 5)}:00Z` : `${day}T${time}:00`;
  return localDate(iso) || day;
}

/**
 * One-line-per-event log entries stamped with the target date. The Log section
 * format is dolly's own (`- \`YYYY-MM-DD HH:mmZ\` @user: text`), so parsing it
 * here stays in sync with how every event is written.
 */
export function eventsOn(task: Task, date: string): MemoEvent[] {
  const out: MemoEvent[] = [];
  for (const line of logSection(task).split('\n')) {
    const m = STAMP.exec(line.trim());
    if (!m || stampLocalDate(m[1], m[2] + m[3]) !== date) continue;
    out.push({ time: `${m[1]} ${m[2]}${m[3]}`, user: m[4], text: m[5] });
  }
  return out;
}

/** repo-relative files a task recorded on the target day, from its short-log trailers */
function filesTouchedToday(task: Task, date: string): string[] {
  // the short log lives in task.md: `- `stamp` @user: summary` lines with
  // indented trailers below. Only a `files:` trailer names source files —
  // other backticked words (`spec.md`, `steps.md#0007`) are pointers into the
  // store, not paths that were edited.
  const raw = readTextOr(path.join(task.dir, 'task.md'));
  if (!raw) return [];
  const out = new Set<string>();
  // One entry = the `- ` head line plus every INDENTED line under it, which is
  // exactly what logLine() writes: continuation lines of a multi-line summary
  // first, trailers last. Anchoring on the indent (rather than "not a new
  // entry") also keeps the un-indented `### plan finalized` blocks out, and
  // matching more than one following line is the point — a two-line summary
  // pushes `files:` down to the third line.
  for (const m of raw.matchAll(/^- `[^`]*` @[^\n]*(?:\n[ \t]+[^\n]*)*/gm)) {
    const block = m[0];
    const head = STAMP.exec(block);
    if (!head || stampLocalDate(head[1], head[2] + head[3]) !== date) continue;
    for (const line of block.split('\n')) {
      if (!/^\s+files:/.test(line)) continue;
      for (const f of line.matchAll(/`([^`]+)`/g)) {
        // `full: \`steps.md#0007\`` shares the trailer line — an anchor, not a path
        if (f[1].includes('#') || f[1].startsWith('.dolly/')) continue;
        out.add(f[1]);
      }
    }
  }
  return [...out];
}

/* -------------------------------- git facts ------------------------------- */

export interface GitFact {
  hash: string;
  subject: string;
  author: string;
}

/** commits authored inside the window, from the project repo (best effort) */
export function gitOn(project: string, date: string, until?: string): GitFact[] {
  const end = until ?? nextDay(date);
  const res = spawnSync(
    'git',
    [
      'log',
      '--since', `${date}T00:00:00`,
      '--until', `${end}T00:00:00`,
      '--pretty=%h%x09%an%x09%s',
    ],
    { cwd: project, encoding: 'utf8' },
  );
  if (res.status !== 0 || !res.stdout) return [];
  return res.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, author, ...subject] = line.split('\t');
      return { hash, author, subject: subject.join('\t') };
    });
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* --------------------------------- digest --------------------------------- */

export interface MemoDigest {
  date: string;
  /** task id → what happened on it today */
  tasks: { task: Task; events: MemoEvent[] }[];
  conversations: {
    sessionId: string;
    span: string;
    turns: number;
    prompts: string[];
    files: string[];
  }[];
  commits: GitFact[];
}

/** build the full mechanical picture of one day */
export function buildDigest(store: Store, date: string): MemoDigest {
  if (!isValidDate(date)) throw new Error(`bad date "${date}" — use YYYY-MM-DD`);

  const tasks: MemoDigest['tasks'] = [];
  for (const task of store.loadTasks()) {
    const events = eventsOn(task, date);
    if (events.length) tasks.push({ task, events });
  }

  const conversations: MemoDigest['conversations'] = [];
  try {
    // a session last touched before this day began cannot hold a turn from it —
    // mtime only ever moves forward. Filtering on that instead of capping the
    // 20 newest is what makes backfilling an older day actually work.
    const dayStart = new Date(`${date}T00:00:00`).getTime();
    const candidates = listSessions(store.project).filter((r) => r.mtime >= dayStart).slice(0, 100);
    for (const ref of candidates) {
      try {
        // the ref already points at the exact session — re-resolving by a
        // prefix could collide with a sibling id, and the error would be
        // swallowed here. parseTranscript(ref) reads exactly that file.
        const t = parseTranscript(ref);
        const segs = t.segments.filter((s: { at: string }) => onDate(s.at, date));
        if (!segs.length) continue;
        conversations.push({
          sessionId: t.sessionId,
          span: `${segs[0].at ?? '?'} → ${segs[segs.length - 1].endedAt ?? '?'}`,
          turns: segs.length,
          prompts: segs.map((s) => s.prompt.split('\n')[0]).filter(Boolean).slice(0, 5),
          files: [...new Set(segs.flatMap((s) => s.files))].slice(0, 20),
        });
      } catch {
        /* unreadable transcript — skip it */
      }
    }
  } catch {
    /* no transcripts at all — fine */
  }

  return { date, tasks, conversations, commits: gitOn(store.project, date) };
}

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** human-readable digest the agent turns into the memo prose */
export function renderDigest(d: MemoDigest): string {
  const out: string[] = [`# dolly memo digest — ${d.date}`, ''];

  out.push('## Task activity', '');
  if (!d.tasks.length) out.push('_no task events recorded this day_', '');
  for (const { task, events } of d.tasks) {
    out.push(`### ${task.meta.id} ${task.meta.title} (${task.meta.status})`, '');
    for (const e of events) out.push(`- \`${e.time}\` @${e.user}: ${clip(e.text, 200)}`);
    const files = filesTouchedToday(task, d.date);
    if (files.length) out.push(`  files: ${files.map((f) => `\`${f}\``).join(', ')}`);
    out.push('');
  }

  out.push('## Conversations', '');
  if (!d.conversations.length) out.push('_none recorded for this day_', '');
  for (const c of d.conversations) {
    out.push(`### session ${c.sessionId.slice(0, 8)} · ${c.turns} turn(s) · ${c.span}`);
    for (const p of c.prompts) out.push(`> ${clip(p, 160)}`);
    if (c.files.length) out.push(`files: ${c.files.map((f) => `\`${f}\``).join(', ')}`);
    out.push('');
  }

  out.push('## Commits', '');
  if (!d.commits.length) out.push('_none this day_', '');
  for (const c of d.commits) out.push(`- ${c.hash} ${clip(c.subject, 120)} (@${c.author})`);

  return out.join('\n');
}

/** does a finished memo exist for this date? */
export function hasMemo(storeRoot: string, date: string): boolean {
  return exists(memoFile(storeRoot, date));
}
