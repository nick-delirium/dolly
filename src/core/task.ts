import path from 'node:path';
import { ensureDir, exists, listFiles, move, readTextOr, writeText } from './fsx.js';
import {
  allBlocks,
  appendBlock,
  appendToSection,
  getBlock,
  countSections,
  demoteHeadings,
  getSection,
  neutralizeMarkers,
  setBlock,
  setSection,
  stringifyFrontmatter,
  type Front,
} from './md.js';
import { Store, readTaskDir, slugify } from './store.js';
import type { Status, Task, TaskMeta } from './types.js';
export type { Task };
import { currentSessionId } from './session.js';
import { nowIso, shortStamp } from './time.js';

export const SEC_SPEC = 'Spec';
export const SEC_CRITERIA = 'Success Criteria';
export const SEC_CONTEXT = 'Full Context';
export const SEC_LOG = 'Log';

export function taskFile(dir: string): string {
  return path.join(dir, 'task.md');
}
export function contextDir(dir: string): string {
  return path.join(dir, 'context');
}
/** current spec plus every superseded version, one file */
export function specFile(dir: string): string {
  return path.join(contextDir(dir), 'spec.md');
}
/** full context of every step, one append-only file */
export function stepsFile(dir: string): string {
  return path.join(contextDir(dir), 'steps.md');
}
export function planFile(dir: string): string {
  return path.join(contextDir(dir), 'plan.md');
}
/** pre-0.2 layout: context/steps/NNNN.md — still readable, never written */
function legacyStepsDir(dir: string): string {
  return path.join(contextDir(dir), 'steps');
}

function pad(n: number): string {
  return String(n).padStart(4, '0');
}

function metaToFront(meta: TaskMeta): Front {
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
  return front;
}

function headerLine(meta: TaskMeta): string {
  const bits = [
    `\`${meta.status}\``,
    `spec v${meta.spec_version}`,
    `@${meta.owner}`,
    `${meta.steps} step${meta.steps === 1 ? '' : 's'}`,
    `updated ${shortStamp(meta.updated)}`,
  ];
  return bits.join(' · ');
}

/** Rewrite task.md from meta + body. The header block is machine-owned. */
export function saveTask(task: Task): void {
  const body = setBlock(task.body, 'header', headerLine(task.meta));
  writeText(taskFile(task.dir), stringifyFrontmatter(metaToFront(task.meta)) + ensureLead(body));
  task.body = body;
}

function ensureLead(body: string): string {
  return body.startsWith('\n') ? body : `\n${body}`;
}

export function touch(task: Task, user?: string): void {
  task.meta.updated = nowIso();
  if (user && !task.meta.collaborators.includes(user)) task.meta.collaborators.push(user);
  // remember which conversation touched this task so `dolly continue` can reopen it
  const session = currentSessionId();
  if (session && !task.meta.sessions.includes(session)) task.meta.sessions.push(session);
}

/** attribute a task to a conversation explicitly (used by reindex) */
export function linkSession(task: Task, sessionId: string): void {
  if (sessionId && !task.meta.sessions.includes(sessionId)) task.meta.sessions.push(sessionId);
}

/* ---------------------------------- log ---------------------------------- */

/**
 * One log line per event: `- `<stamp>` @user: <text>` plus indented trailers.
 * Flat and chronological so a human can read the whole history top to bottom.
 */
function logLine(user: string, text: string, trailers: string[] = []): string {
  const parts = text
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const lines = [`- \`${shortStamp()}\` @${user}: ${parts[0] ?? ''}`];
  for (const l of parts.slice(1)) lines.push(`  ${l}`);
  if (trailers.length) lines.push(`  ${trailers.join(' · ')}`);
  return lines.join('\n');
}

function appendLog(task: Task, user: string, text: string, trailers: string[] = []): void {
  assertOneSection(task, SEC_LOG);
  task.body = appendToSection(task.body, SEC_LOG, logLine(user, text, trailers), true);
}

/**
 * Guard against prose impersonating structure. Section lookup takes the first
 * match, so a second `## Log` — easily written by a spec that discusses the
 * format — would silently redirect every step into the spec section.
 */
function assertOneSection(task: Task, name: string): void {
  const n = countSections(task.body, name);
  if (n > 1) {
    throw new Error(
      `task ${task.meta.id} has ${n} "## ${name}" headings in task.md, so dolly cannot tell which one it owns. ` +
        `Remove the duplicate from the prose (most likely inside the Spec section) and retry.`,
    );
  }
}

/** how the short log points at a step's full context */
function stepRef(n: number): string {
  return `full: \`steps.md#${pad(n)}\``;
}

function fileList(files: string[], max: number): string {
  const shown = files.slice(0, max).map((f) => `\`${f}\``).join(', ');
  const rest = files.length - max;
  return rest > 0 ? `${shown} +${rest} more` : shown;
}

/* --------------------------------- create -------------------------------- */

export interface CreateOpts {
  title: string;
  status?: Status;
  tags?: string[];
  /** short spec text for the shared updates file */
  specShort?: string;
  /** full spec text stored as context/spec.md */
  specFull?: string;
  criteria?: string[];
}

const CONTEXT_INDEX = [
  '- full spec + every superseded version: `context/spec.md`',
  '- full context of every step: `context/steps.md`',
  '- planning interview, when the task was planned: `context/plan.md`',
].join('\n');

/** frontmatter is line-oriented, so a title can never contain a newline */
export function cleanTitle(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

export function createTask(store: Store, opts: CreateOpts): Task {
  store.init();
  const title = cleanTitle(opts.title);
  if (!title) throw new Error('a task needs a title');
  const id = store.nextId();
  const slug = slugify(title);
  const dir = path.join(store.tasksDir, `${id}-${slug}`);
  if (exists(dir)) throw new Error(`task dir already exists: ${dir}`);
  const now = nowIso();
  const user = store.user;

  const meta: TaskMeta = {
    id,
    slug,
    title,
    status: opts.status ?? 'todo',
    owner: user,
    collaborators: [user],
    tags: opts.tags ?? [],
    steps: 0,
    spec_version: 1,
    created: now,
    updated: now,
    sessions: currentSessionId() ? [currentSessionId()!] : [],
  };

  const criteria = opts.criteria?.length
    ? demoteHeadings(opts.criteria.map((c) => `- [ ] ${c}`).join('\n'))
    : '- [ ] _TBD_';

  const body = [
    `# ${id} · ${title}`,
    '',
    '<!-- dolly:header -->',
    headerLine(meta),
    '<!-- /dolly:header -->',
    '',
    `## ${SEC_SPEC}`,
    '',
    demoteHeadings((opts.specShort ?? '_TBD — describe what this feature must do._').trim()),
    '',
    `## ${SEC_CRITERIA}`,
    '',
    criteria,
    '',
    `## ${SEC_CONTEXT}`,
    '',
    CONTEXT_INDEX,
    '',
    `## ${SEC_LOG}`,
    '',
    '_no steps yet_',
    '',
  ].join('\n');

  ensureDir(contextDir(dir));
  const task: Task = { meta, dir, rel: path.relative(store.root, dir), body };
  saveTask(task);

  const specBody = (opts.specFull ?? opts.specShort ?? '').trim() || '_Spec not written yet._';
  writeText(specFile(dir), renderSpecFile(meta, 1, now, user, specBody, ''));
  writeText(stepsFile(dir), stepsFileHeader(meta));
  return task;
}

/* ---------------------------------- spec --------------------------------- */

interface SpecDoc {
  version: number;
  at: string;
  by: string;
  body: string;
  history: string;
}

const NO_HISTORY = '_none — v1 is the first spec_';

function specStamp(version: number, at: string, by: string): string {
  return `<!-- v${version} · ${at} · @${by} -->`;
}

function renderSpecFile(
  meta: TaskMeta,
  version: number,
  at: string,
  by: string,
  body: string,
  history: string,
): string {
  const meta_line =
    `**current: v${version}** · updated ${at} by @${by}` +
    (version > 1 ? ' · superseded versions are kept at the bottom of this file' : '');
  return [
    `<!-- dolly spec · task ${meta.id} -->`,
    `# Spec — ${meta.title}`,
    '',
    meta_line,
    '',
    '<!-- dolly:spec-current -->',
    specStamp(version, at, by),
    '',
    // a spec quoting dolly's own markers would otherwise end the block early and
    // the next bump would save the truncated text as history
    neutralizeMarkers(body.trim()),
    '<!-- /dolly:spec-current -->',
    '',
    '---',
    '',
    '## Superseded versions',
    '',
    '<!-- dolly:spec-history -->',
    neutralizeMarkers((history || NO_HISTORY).trim()),
    '<!-- /dolly:spec-history -->',
    '',
  ]
    .filter((l, i, all) => !(l === '' && all[i - 1] === ''))
    .join('\n');
}

export function readSpecDoc(dir: string): SpecDoc | null {
  const raw = readTextOr(specFile(dir));
  if (!raw) return null;
  const cur = getBlock(raw, 'spec-current');
  if (cur === null) {
    // hand-edited or foreign file: treat the whole thing as the current spec
    return { version: 1, at: '', by: '', body: stripComments(raw), history: '' };
  }
  const m = /^<!--\s*v(\d+)\s*·\s*(\S+)\s*·\s*@(\S+)\s*-->/.exec(cur);
  return {
    version: m ? Number(m[1]) : 1,
    at: m ? m[2] : '',
    by: m ? m[3] : '',
    body: cur.replace(/^<!--[\s\S]*?-->\s*/, '').trim(),
    history: getBlock(raw, 'spec-history') ?? '',
  };
}

function stripComments(text: string): string {
  return text.replace(/^(<!--[\s\S]*?-->\s*)+/, '').trim();
}

export interface SpecUpdate {
  /** replaces the short Spec section in task.md */
  short?: string;
  /** replaces the current spec in context/spec.md; old one moves to history */
  full?: string;
  criteria?: string[];
  reason?: string;
}

export function updateSpec(store: Store, task: Task, up: SpecUpdate): number {
  const user = store.user;
  const full = up.full?.trim() ?? '';
  const short = up.short?.trim() ?? '';
  const crit = (up.criteria ?? []).map((c) => c.trim()).filter(Boolean);
  if (!full && !short && !crit.length) throw new Error('nothing to change — pass a short spec, a full spec, or criteria');
  // every check before any write: a guard that throws after spec.md was already
  // rewritten left the two files disagreeing about the version
  if (short) assertOneSection(task, SEC_SPEC);
  if (crit.length) assertOneSection(task, SEC_CRITERIA);
  assertOneSection(task, SEC_LOG);
  const reason = up.reason?.trim() ?? '';

  if (full) {
    const prev = readSpecDoc(task.dir);
    const version = task.meta.spec_version + 1;
    task.meta.spec_version = version;

    let history = prev?.history === NO_HISTORY ? '' : (prev?.history ?? '');
    if (prev && prev.body) {
      const entry = [
        `## v${prev.version} — ${prev.at || 'unknown date'} · @${prev.by || 'unknown'}`,
        '',
        reason ? `> superseded by v${version}: ${reason}` : `> superseded by v${version}`,
        '',
        prev.body,
      ].join('\n');
      history = history ? `${entry}\n\n${history}` : entry;
    }
    writeText(specFile(task.dir), renderSpecFile(task.meta, version, nowIso(), user, full, history));
  }

  if (short) task.body = setSection(task.body, SEC_SPEC, short);
  if (crit.length) {
    task.body = setSection(
      task.body,
      SEC_CRITERIA,
      crit.map((c) => `- [ ] ${c.replace(/^\s*-\s*\[[ xX]\]\s*/, '')}`).join('\n'),
    );
  }
  if (full) {
    appendLog(task, user, `spec → v${task.meta.spec_version}. ${reason}`.trim(), [
      `previous version kept in \`spec.md\``,
    ]);
  } else {
    // no version bump, but still history: "never silently rewrite" covers the
    // summary and the criteria as much as the full spec
    const what = [short && 'short spec', crit.length && 'criteria'].filter(Boolean).join(' + ');
    appendLog(task, user, `${what} updated.${reason ? ` ${reason}` : ''}`);
  }
  touch(task, user);
  saveTask(task);
  return task.meta.spec_version;
}

/* ---------------------------------- steps -------------------------------- */

function stepsFileHeader(meta: TaskMeta): string {
  return [
    `<!-- dolly steps · task ${meta.id} · append-only, newest at the bottom -->`,
    `# Full step context — ${meta.title}`,
    '',
    'Short summaries live in `../task.md`. Each entry below is the full context of one step:',
    'decisions and why, options rejected, gotchas, snippets, what to do next.',
    '',
  ].join('\n');
}

export interface StepInput {
  summary: string;
  files?: string[];
  /** long-form context: decisions, dead ends, snippets, next hints */
  detail?: string;
  status?: Status;
  /** provenance for imported steps, e.g. `session <id> · turn <uuid>` */
  source?: string;
}

/** most files a log line names before it says "+N more" */
const LOG_FILES = 6;

export function addStep(store: Store, task: Task, input: StepInput): number {
  const user = store.user;
  if (input.status !== undefined && !store.config.statuses.includes(input.status)) {
    throw new Error(`unknown status "${input.status}" — allowed: ${store.config.statuses.join(', ')}`);
  }
  assertOneSection(task, SEC_LOG);
  const raw = readTextOr(stepsFile(task.dir));
  // the counter alone is not enough: two branches that each logged step N merge
  // into a frontmatter saying N while steps.md holds N twice
  const n = Math.max(task.meta.steps, ...allBlocks(raw, 'step').map((b) => Number(b.id) || 0)) + 1;
  task.meta.steps = n;

  const files = normalizeFiles(store.project, input.files ?? []);
  // the short log keeps LOG_FILES; past that, the step's entry in steps.md is
  // the only place the whole list survives, so one gets written even with no
  // detail note — `dolly related` reads it from there
  const detail = input.detail?.trim() || (files.length > LOG_FILES ? '_No detail note — entry kept for the full file list._' : '');

  const trailers: string[] = [];
  if (files.length) trailers.push(`files: ${fileList(files, LOG_FILES)}`);
  if (detail) trailers.push(stepRef(n));
  appendLog(task, user, input.summary, trailers);

  if (detail) {
    const entry = [
      `## ${pad(n)} · ${nowIso()} · @${user}`,
      '',
      `- task status: ${input.status ?? task.meta.status}`,
      files.length ? `- files: ${files.map((f) => `\`${f}\``).join(', ')}` : '- files: none',
      ...(input.source ? [`- source: ${input.source}`] : []),
      '',
      detail,
    ].join('\n');
    writeText(stepsFile(task.dir), appendBlock(raw || stepsFileHeader(task.meta), `step ${pad(n)}`, entry));
  }

  if (input.status && input.status !== task.meta.status) {
    appendLog(task, user, `status ${task.meta.status} → ${input.status}.`);
    task.meta.status = input.status;
  }
  touch(task, user);
  saveTask(task);
  return n;
}

/**
 * Repo-relative, `/`-separated, no `./` — the one spelling every recorded file
 * uses, so `dolly related --files ./src/a.ts` finds a step that logged `src/a.ts`.
 */
export function normalizeFiles(project: string, files: string[]): string[] {
  const out: string[] = [];
  for (const raw of files) {
    let f = raw.trim();
    if (!f) continue;
    if (path.isAbsolute(f)) {
      const rel = path.relative(project, f);
      if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) f = rel;
    }
    f = f.split(path.sep).join('/').replace(/^(\.\/)+/, '');
    if (f && !out.includes(f)) out.push(f);
  }
  return out;
}

export interface StepEntry {
  id: string;
  text: string;
}

/** every step's full context, oldest first. Falls back to the pre-0.2 layout. */
export function stepEntries(dir: string): StepEntry[] {
  const raw = readTextOr(stepsFile(dir));
  if (raw) return allBlocks(raw, 'step');
  return listFiles(legacyStepsDir(dir))
    .filter((f) => /^\d+\.md$/.test(f))
    .map((f) => ({
      id: f.replace(/\.md$/, ''),
      text: readTextOr(path.join(legacyStepsDir(dir), f)),
    }));
}

/* -------------------------------- retitle -------------------------------- */

/**
 * Rename a task. The id is the stable handle, so the directory slug follows the
 * title — a stale slug in every path is exactly the kind of drift dolly exists
 * to prevent. Returns the task at its new location.
 */
export function retitle(store: Store, task: Task, title: string): Task {
  const next = cleanTitle(title);
  if (!next) throw new Error('a task needs a title');
  const from = task.meta.title;
  if (from === next) return task;

  task.meta.title = next;
  // a replacer function: a string replacement would expand `$&`, `$'` and `$$`
  // inside the title
  task.body = task.body.replace(/^#\s+.*$/m, () => `# ${task.meta.id} · ${next}`);
  appendLog(task, store.user, `retitled: "${from}" → "${next}".`);
  touch(task, store.user);
  saveTask(task);

  const slug = slugify(next);
  if (slug === task.meta.slug) return task;
  const dest = path.join(path.dirname(task.dir), `${task.meta.id}-${slug}`);
  if (exists(dest)) throw new Error(`cannot move task: ${dest} already exists`);
  move(task.dir, dest);
  const moved = readTaskDir(dest, path.relative(store.root, dest));
  if (!moved) throw new Error(`retitle failed for ${task.meta.id}`);
  moved.meta.slug = slug;
  saveTask(moved);
  return moved;
}

/* --------------------------------- status -------------------------------- */

export function setStatus(store: Store, task: Task, status: Status, note?: string): void {
  if (!store.config.statuses.includes(status)) {
    throw new Error(`unknown status "${status}" — allowed: ${store.config.statuses.join(', ')}`);
  }
  const from = task.meta.status;
  if (from === status && !note) {
    // `dolly status X working` on a task already working is how a new
    // conversation says "this one is mine now": attach it, so auto-log follows
    const session = currentSessionId();
    if (session && !task.meta.sessions.includes(session)) {
      touch(task, store.user);
      saveTask(task);
    }
    return;
  }
  task.meta.status = status;
  appendLog(
    task,
    store.user,
    `status ${from} → ${status}.${note?.trim() ? ` ${note.trim()}` : ''}`,
  );
  touch(task, store.user);
  saveTask(task);
}

/* ---------------------------------- read --------------------------------- */

export function reload(_store: Store, task: Task): Task {
  const t = readTaskDir(task.dir, task.rel);
  if (!t) throw new Error(`task disappeared: ${task.dir}`);
  return t;
}

export function shortSpec(task: Task): string {
  return getSection(task.body, SEC_SPEC) ?? '';
}

export function criteria(task: Task): string {
  return getSection(task.body, SEC_CRITERIA) ?? '';
}

export function logSection(task: Task): string {
  return getSection(task.body, SEC_LOG) ?? '';
}

export function fullSpec(task: Task): string {
  return readSpecDoc(task.dir)?.body ?? '';
}

export function specHistory(task: Task): string {
  const h = readSpecDoc(task.dir)?.history ?? '';
  return h === NO_HISTORY ? '' : h;
}

export function plan(task: Task): string {
  return readTextOr(planFile(task.dir));
}

/** last N step entries, oldest first. n <= 0 returns all. */
export function recentStepDetails(task: Task, n: number): StepEntry[] {
  const all = stepEntries(task.dir);
  return n <= 0 ? all : all.slice(-n);
}
