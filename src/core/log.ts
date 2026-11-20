/**
 * `log.jsonl`: the append-only record task.md is rendered from.
 *
 * task.md used to be both the human document and the parsed database, which
 * cost four shipped bugs of one class (prose impersonating structure) and made
 * every write a merge conflict: each one touched `updated`, the step counter
 * and the log tail. Now task.md is generated and never parsed back once a task
 * has a log; the log is one JSON object per line, appended, and git merges it
 * as a union (`.dolly/.gitattributes`).
 *
 * An event is a DIFF of the task's state, taken in `saveTask` — the one place
 * every writer already goes through — so the writers keep building task.md the
 * way they always did, and the log records what changed:
 *
 *   base   first line: meta + the body verbatim (creation, or the v8 migration)
 *   set    scalar meta (title, slug, status, owner, tags, created, digest)
 *   add    set-union lists (collaborators, sessions)
 *   inc    counters (steps, spec_version) — summed, so two teammates' steps
 *          made offline both count after a merge
 *   lead   the text before the first `## ` section, raw
 *   sec    whole sections by name, raw
 *   log    text appended to the Log section — what nearly every write is, and
 *          what merges cleanly
 *   body   the whole body, raw: the fallback when nothing finer reproduces it
 *
 * Folding sorts by `at` (stable — file order breaks ties), applies, and renders.
 * Derived, never stored: `steps`, `spec_version`, `updated`.
 */
import path from 'node:path';
import fs from 'node:fs';
import { exists, readTextOr, writeText } from './fsx.js';
import { setBlock, stringifyFrontmatter, type Front } from './md.js';
import { shortStamp } from './time.js';
import type { TaskMeta } from './types.js';

export const LOG_FILE = 'log.jsonl';
const SEC_LOG = 'Log';

export function logFile(dir: string): string {
  return path.join(dir, LOG_FILE);
}

export function hasEventLog(dir: string): boolean {
  return exists(logFile(dir));
}

type Scalar = 'id' | 'title' | 'slug' | 'status' | 'owner' | 'created' | 'digest';
const SCALARS: Scalar[] = ['id', 'title', 'slug', 'status', 'owner', 'created', 'digest'];

export interface TaskEvent {
  v: 1;
  at: string;
  by: string;
  base?: { meta: TaskMeta; body: string };
  set?: Partial<Pick<TaskMeta, Scalar>> & { tags?: string[] };
  add?: { collaborators?: string[]; sessions?: string[] };
  inc?: { steps?: number; spec_version?: number };
  lead?: string;
  sec?: Record<string, string>;
  log?: string;
  body?: string;
}

/* ------------------------------ reading/writing --------------------------- */

/**
 * Every event, in fold order. A line that does not parse is skipped, never
 * fatal: a merge that left a broken line must not make the task unreadable.
 */
export function readEvents(dir: string): TaskEvent[] {
  const out: { e: TaskEvent; i: number }[] = [];
  readTextOr(logFile(dir))
    .split('\n')
    .forEach((line, i) => {
      if (!line.trim()) return;
      try {
        const e = JSON.parse(line);
        if (e && typeof e === 'object' && typeof e.at === 'string') out.push({ e, i });
      } catch {
        /* a torn line — skip it */
      }
    });
  // the earliest base starts the fold; a second one (the same task migrated
  // on two branches) is dropped rather than resetting the other's events
  const bases = out.filter((x) => x.e.base).sort((a, b) => a.e.at.localeCompare(b.e.at) || a.i - b.i);
  const rest = out.filter((x) => !x.e.base).sort((a, b) => a.e.at.localeCompare(b.e.at) || a.i - b.i);
  return [...bases.slice(0, 1), ...rest].map((x) => x.e);
}

export function appendEvent(dir: string, e: TaskEvent): void {
  fs.appendFileSync(logFile(dir), `${JSON.stringify(e)}\n`, 'utf8');
}

/* ----------------------------------- body --------------------------------- */

interface Chunks {
  lead: string;
  /** `## <name>` sections in order; raw = everything after the heading line */
  secs: { name: string; raw: string }[];
}

export function splitBody(body: string): Chunks {
  const parts = body.split(/^(?=## )/m);
  const lead = parts[0].startsWith('## ') ? '' : parts.shift()!;
  return {
    lead,
    secs: parts.map((p) => {
      const nl = p.indexOf('\n');
      const head = nl === -1 ? p : p.slice(0, nl);
      return { name: head.replace(/^##\s+/, '').trim(), raw: nl === -1 ? '' : p.slice(nl) };
    }),
  };
}

function joinBody(c: Chunks): string {
  return c.lead + c.secs.map((s) => `## ${s.name}${s.raw}`).join('');
}

/** the Log section's raw text with `extra` appended the way appendToSection does it */
function appendLogRaw(raw: string, extra: string): string {
  return `\n\n${raw.trim()}${extra}\n\n`;
}

/* ----------------------------------- fold --------------------------------- */

export interface Folded {
  meta: TaskMeta;
  /** the body with the machine-owned header block refreshed */
  body: string;
}

export function fold(events: TaskEvent[]): Folded | null {
  const first = events[0];
  if (!first?.base) return null;
  const meta: TaskMeta = {
    ...first.base.meta,
    collaborators: [...first.base.meta.collaborators],
    tags: [...first.base.meta.tags],
    sessions: [...first.base.meta.sessions],
  };
  let chunks = splitBody(first.base.body);
  for (const e of events.slice(1)) {
    if (e.set) {
      for (const k of SCALARS) if (e.set[k] !== undefined) (meta as any)[k] = e.set[k];
      if (e.set.tags) meta.tags = [...e.set.tags];
    }
    for (const k of ['collaborators', 'sessions'] as const) {
      for (const v of e.add?.[k] ?? []) if (!meta[k].includes(v)) meta[k].push(v);
    }
    if (e.inc?.steps) meta.steps += e.inc.steps;
    if (e.inc?.spec_version) meta.spec_version += e.inc.spec_version;
    if (e.body !== undefined) chunks = splitBody(e.body);
    if (e.lead !== undefined) chunks.lead = e.lead;
    for (const [name, raw] of Object.entries(e.sec ?? {})) {
      const s = chunks.secs.find((x) => x.name === name);
      if (s) s.raw = raw;
      else chunks.secs.push({ name, raw });
    }
    if (e.log) {
      const s = chunks.secs.find((x) => x.name === SEC_LOG);
      if (s) s.raw = appendLogRaw(s.raw, e.log);
      else chunks.secs.push({ name: SEC_LOG, raw: appendLogRaw('', e.log) });
    }
    if (e.at > meta.updated) meta.updated = e.at;
  }
  return { meta, body: setBlock(joinBody(chunks), 'header', headerLine(meta)) };
}

/* ------------------------------------ diff -------------------------------- */

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * The event that turns `prev` into `next`, or null when nothing changed. The
 * caller checks the fold reproduces `next` and falls back to a `body` op.
 */
export function diffEvent(prev: Folded, next: Folded, at: string, by: string): TaskEvent | null {
  const e: TaskEvent = { v: 1, at, by };
  const set: TaskEvent['set'] = {};
  for (const k of SCALARS) if ((next.meta as any)[k] !== (prev.meta as any)[k]) (set as any)[k] = (next.meta as any)[k];
  if (!sameList(next.meta.tags, prev.meta.tags)) set.tags = [...next.meta.tags];
  if (Object.keys(set).length) e.set = set;
  const add: NonNullable<TaskEvent['add']> = {};
  for (const k of ['collaborators', 'sessions'] as const) {
    const fresh = next.meta[k].filter((v) => !prev.meta[k].includes(v));
    if (fresh.length) add[k] = fresh;
  }
  if (Object.keys(add).length) e.add = add;
  const inc: NonNullable<TaskEvent['inc']> = {};
  if (next.meta.steps !== prev.meta.steps) inc.steps = next.meta.steps - prev.meta.steps;
  if (next.meta.spec_version !== prev.meta.spec_version) inc.spec_version = next.meta.spec_version - prev.meta.spec_version;
  if (Object.keys(inc).length) e.inc = inc;

  // the header block is rendered from meta: never part of a diff
  const strip = (b: string) => setBlock(b, 'header', '');
  const a = splitBody(strip(prev.body));
  const b = splitBody(strip(next.body));
  const names = (c: Chunks) => c.secs.map((s) => s.name).join('\u0000');
  if (names(a) !== names(b) && !(names(b).startsWith(names(a)) && b.secs.length > a.secs.length)) {
    e.body = strip(next.body);
  } else {
    if (a.lead !== b.lead) e.lead = b.lead;
    const sec: Record<string, string> = {};
    for (const s of b.secs) {
      const old = a.secs.find((x) => x.name === s.name);
      if (old && old.raw === s.raw) continue;
      if (s.name === SEC_LOG && old) {
        const o = old.raw.trim();
        const n = s.raw.trim();
        if (o && n.startsWith(o) && appendLogRaw(old.raw, n.slice(o.length)) === s.raw) {
          e.log = n.slice(o.length);
          continue;
        }
      }
      sec[s.name] = s.raw;
    }
    if (Object.keys(sec).length) e.sec = sec;
  }
  const changed = Object.keys(e).some((k) => !['v', 'at', 'by'].includes(k));
  return changed ? e : null;
}

/* ---------------------------------- render -------------------------------- */

export function metaToFront(meta: TaskMeta): Front {
  const front: Front = {
    id: meta.id,
    slug: meta.slug,
    title: meta.title,
    status: meta.status,
    owner: meta.owner,
    collaborators: meta.collaborators,
    tags: meta.tags,
    steps: meta.steps,
    spec_version: meta.spec_version,
    created: meta.created,
    updated: meta.updated,
  };
  if (meta.sessions.length) front.sessions = meta.sessions;
  if (meta.digest) front.digest = meta.digest;
  return front;
}

export function headerLine(meta: TaskMeta): string {
  const bits = [
    `\`${meta.status}\``,
    `spec v${meta.spec_version}`,
    `@${meta.owner}`,
    `${meta.steps} step${meta.steps === 1 ? '' : 's'}`,
    `updated ${shortStamp(meta.updated)}`,
  ];
  return bits.join(' · ');
}

export function renderTaskMd(meta: TaskMeta, body: string): string {
  return stringifyFrontmatter(metaToFront(meta)) + (body.startsWith('\n') ? body : `\n${body}`);
}

/** task.md from the log alone — what `dolly render` writes */
export function renderFromLog(dir: string): string | null {
  const f = fold(readEvents(dir));
  return f ? renderTaskMd(f.meta, f.body) : null;
}

export function writeRendered(dir: string): boolean {
  const out = renderFromLog(dir);
  if (out === null) return false;
  if (readTextOr(path.join(dir, 'task.md')) !== out) writeText(path.join(dir, 'task.md'), out);
  return true;
}
