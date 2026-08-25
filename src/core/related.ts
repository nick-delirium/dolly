/**
 * Cross-task links, derived — never stored.
 *
 * dolly already records the files every step touched. That makes it the only
 * thing in the toolchain that can answer "who else has been in this code, and
 * what did they conclude?" — which is exactly what an agent needs before editing
 * a file in a repo with history. Nothing new is written to disk: the index is
 * rebuilt from steps.md on demand, so it can never go stale.
 */
import { byRecency } from './store.js';
import type { Store } from './store.js';
import type { Task } from './types.js';
import { logSection, stepEntries } from './task.js';

/**
 * One parsed entry of the `task.md` log.
 *
 * The log is the complete record — every step, status move and spec bump, with
 * its files. `steps.md` only holds the ones that carried a detail note, so
 * reading files or outcomes from there misses summary-only steps entirely.
 */
export interface LogEntry {
  kind: 'step' | 'status' | 'spec' | 'note';
  at: string;
  user: string;
  text: string;
  files: string[];
}

const LINE = /^- `([^`]*)`\s*@(\S+?):\s*(.*)$/;

export function parseLog(task: Task): LogEntry[] {
  const out: LogEntry[] = [];
  for (const raw of logSection(task).split('\n')) {
    const m = LINE.exec(raw.trim());
    if (m) {
      const text = m[3].trim();
      out.push({ kind: classify(text), at: m[1], user: m[2], text, files: [] });
      continue;
    }
    // indented trailer belonging to the entry above: `files: …` / `full: …`
    const last = out[out.length - 1];
    if (!last) continue;
    const files = /(?:^|·\s*)files:\s*(.+?)(?:\s*·\s*full:|$)/.exec(raw.trim())?.[1];
    if (!files) continue;
    for (const f of files.matchAll(/`([^`]+)`/g)) {
      if (!last.files.includes(f[1])) last.files.push(f[1]);
    }
  }
  return out;
}

function classify(text: string): LogEntry['kind'] {
  if (/^status \S+ → \S+/.test(text)) return 'status';
  if (/^spec → v\d+/.test(text)) return 'spec';
  if (/^(archived|restored|housekeeping|retitled)\b/.test(text)) return 'note';
  return 'step';
}

/** every file any log entry recorded — the complete set, not just detailed steps */
export function filesOfTask(task: Task): string[] {
  const out = new Set<string>();
  for (const e of parseLog(task)) for (const f of e.files) out.add(f);
  // pre-0.3 stores kept files only inside step entries; keep reading those too
  for (const entry of stepEntries(task.dir)) {
    const line = /^- files:\s*(.+)$/m.exec(entry.text)?.[1];
    if (!line || /^none$/i.test(line.trim())) continue;
    for (const m of line.matchAll(/`([^`]+)`/g)) out.add(m[1]);
  }
  return [...out].sort();
}

/**
 * What actually happened on a task, most recent first choice. Prefers a real
 * step: a status move or spec bump is the last *line* but tells you nothing
 * about the work, and this is read as "what did they conclude".
 */
export function latestOutcome(task: Task, max = 200): string {
  const entries = parseLog(task);
  const step = [...entries].reverse().find((e) => e.kind === 'step');
  const chosen = step ?? entries[entries.length - 1];
  if (!chosen) return '_no steps yet_';
  const text = chosen.text;
  const clipped = text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
  // say so when the newest thing is not a step, rather than implying it is
  return step ? clipped : `(no step logged yet) ${clipped}`;
}

export interface RelatedTask {
  task: Task;
  /** files this task and the subject both touched */
  shared: string[];
  outcome: string;
}

/**
 * Tasks that touched any of `files`, most overlap first. `excludeId` keeps a
 * task from being reported as related to itself.
 */
export function relatedByFiles(store: Store, files: string[], excludeId?: string): RelatedTask[] {
  if (!files.length) return [];
  const wanted = new Set(files);
  const out: RelatedTask[] = [];
  for (const task of store.loadTasks()) {
    if (task.meta.id === excludeId) continue;
    const shared = filesOfTask(task).filter((f) => wanted.has(f));
    if (!shared.length) continue;
    out.push({ task, shared, outcome: latestOutcome(task) });
  }
  return out.sort((a, b) => b.shared.length - a.shared.length);
}

export function relatedToTask(store: Store, task: Task): RelatedTask[] {
  return relatedByFiles(store, filesOfTask(task), task.meta.id);
}

/* --------------------------- title / spec overlap -------------------------- */

const STOP = new Set([
  'the','a','an','and','or','of','to','for','in','on','with','add','fix','make','use','support',
  'update','new','remove','into','from','that','this','it','is','be','as','at','by','via','when',
]);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

export interface Overlap {
  task: Task;
  words: string[];
  outcome: string;
}

/**
 * Before a new task is opened, cheap check for one that already covers it.
 * Word overlap only — a hint to make the agent look, not a claim of duplication.
 */
export function overlappingTasks(store: Store, title: string, min = 2): Overlap[] {
  const want = tokens(title);
  if (!want.size) return [];
  const out: Overlap[] = [];
  for (const task of store.loadTasks()) {
    const words = [...tokens(task.meta.title)].filter((w) => want.has(w));
    if (words.length < min) continue;
    out.push({ task, words, outcome: latestOutcome(task, 120) });
  }
  return out.sort((a, b) => b.words.length - a.words.length).slice(0, 5);
}

/* --------------------------------- render --------------------------------- */

/** recently finished work, so a new task knows what just shipped */
export function recentlyFinished(store: Store, limit = 5): Task[] {
  return store
    .loadTasks()
    .filter((t) => t.meta.status === store.config.doneStatus || t.meta.status === store.config.reviewStatus)
    .sort(byRecency)
    .slice(0, limit);
}

export function renderRelated(related: RelatedTask[], limit = 6): string {
  if (!related.length) return '';
  const out: string[] = [];
  for (const r of related.slice(0, limit)) {
    const files = r.shared.slice(0, 4).map((f) => `\`${f}\``).join(', ');
    const more = r.shared.length > 4 ? ` +${r.shared.length - 4} more` : '';
    out.push(
      `- **${r.task.meta.id} ${r.task.meta.title}** (${r.task.meta.status}) — shares ${files}${more}`,
      `  last: ${r.outcome}`,
    );
  }
  if (related.length > limit) out.push(`- _+${related.length - limit} more_`);
  return out.join('\n');
}
