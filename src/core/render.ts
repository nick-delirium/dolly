import { codeMapLine, projectDigest } from './project.js';
import { filesOfTask, relatedByFiles, renderRelated } from './related.js';
import type { Store } from './store.js';
import type { Task } from './types.js';
import {
  criteria,
  fullSpec,
  logSection,
  plan,
  recentStepDetails,
  shortSpec,
  specHistory,
} from './task.js';
import { humanAge } from './time.js';

const useColor =
  !process.env.NO_COLOR && (process.stdout.isTTY || process.env.FORCE_COLOR === '1');

const C = {
  dim: (s: string) => (useColor ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s: string) => (useColor ? `\x1b[1m${s}\x1b[0m` : s),
  cyan: (s: string) => (useColor ? `\x1b[36m${s}\x1b[0m` : s),
  green: (s: string) => (useColor ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s: string) => (useColor ? `\x1b[33m${s}\x1b[0m` : s),
  magenta: (s: string) => (useColor ? `\x1b[35m${s}\x1b[0m` : s),
  red: (s: string) => (useColor ? `\x1b[31m${s}\x1b[0m` : s),
};

const STATUS_STYLE: Record<string, (s: string) => string> = {
  todo: C.dim,
  planning: C.magenta,
  working: C.cyan,
  validating: C.yellow,
  done: C.green,
};

const STATUS_ICON: Record<string, string> = {
  todo: '○',
  planning: '◍',
  working: '◐',
  validating: '◑',
  done: '●',
};

export interface ProjectRow {
  path: string;
  store: string;
  local: boolean;
  /** null when the recorded store is no longer there */
  tasks: number | null;
  updated: string | null;
  current: boolean;
}

export function renderProjects(rows: ProjectRow[], home: string): string {
  if (!rows.length) {
    return `${C.bold('dolly · no projects yet')}\n\n${C.dim('`dolly init` in a project registers it here.')}`;
  }
  const short = (p: string) => (home && p.startsWith(home) ? `~${p.slice(home.length)}` : p);
  const pathW = Math.max(...rows.map((r) => short(r.path).length));
  const out = [C.bold(`dolly · ${rows.length} project${rows.length === 1 ? '' : 's'}`), ''];
  for (const r of rows) {
    const kind = r.local ? C.dim('in repo ') : C.cyan('private');
    const where = r.tasks === null ? C.yellow('store missing') : C.dim(short(r.store));
    const activity =
      r.tasks === null
        ? ''
        : `${r.tasks} task${r.tasks === 1 ? '' : 's'}${r.updated ? ` · ${humanAge(r.updated)}` : ''}`;
    out.push(
      `  ${r.current ? C.green('▸') : ' '} ${short(r.path).padEnd(pathW)}  ${kind}  ${where}  ${C.dim(activity)}`.trimEnd(),
    );
  }
  out.push('', C.dim('`dolly projects --prune` forgets entries whose store is gone.'));
  return out.join('\n');
}

/**
 * How this store relates to the project, in a few words. Empty for the ordinary
 * case — a `.dolly/` in the repo needs no explaining.
 */
export function storeNote(store: Store): string {
  switch (store.kind) {
    case 'linked':
      return ' (private to you — outside the repo, nothing to commit)';
    case 'global':
      return ' (global store — this directory is not a repo)';
    case 'env':
      return ' (pinned by DOLLY_DIR)';
    default:
      return '';
  }
}

export function renderBoard(store: Store, tasks: Task[]): string {
  const out: string[] = [];
  // Say out loud when the store is not in the repo. Otherwise the only clue is
  // an unusual path, and "why can my teammate not see these tasks?" has no
  // answer anywhere on screen.
  const header = `dolly · ${store.root}${C.dim(storeNote(store))}`;
  out.push(C.bold(header), '');

  const statuses = [...store.config.statuses];
  for (const t of tasks) if (!statuses.includes(t.meta.status)) statuses.push(t.meta.status);

  let printed = 0;
  for (const status of statuses) {
    const group = tasks.filter((t) => t.meta.status === status);
    if (!group.length) continue;
    const style = STATUS_STYLE[status] ?? ((s: string) => s);
    out.push(style(`${STATUS_ICON[status] ?? '·'} ${status.toUpperCase()}  ${C.dim(`(${group.length})`)}`));
    for (const t of group) out.push(`  ${taskLine(t)}`);
    out.push('');
    printed += group.length;
  }

  if (!printed) out.push(C.dim('no tasks — `dolly new "<title>"` or `dolly plan start "<idea>"`'));
  return out.join('\n');
}

function taskLine(t: Task): string {
  const bits = [
    C.bold(t.meta.id),
    t.meta.title,
    C.dim(`@${t.meta.owner}`),
    C.dim(humanAge(t.meta.updated || t.meta.created)),
    C.dim(`${t.meta.steps}✎`),
  ];
  if (t.meta.spec_version > 1) bits.push(C.dim(`spec v${t.meta.spec_version}`));
  if (t.meta.tags.length) bits.push(C.dim(t.meta.tags.map((x) => `#${x}`).join(' ')));
  return bits.join('  ');
}

export function renderShow(task: Task, opts: { full?: boolean } = {}): string {
  const out: string[] = [];
  out.push(C.bold(`${task.meta.id} · ${task.meta.title}`));
  out.push(
    [
      (STATUS_STYLE[task.meta.status] ?? ((s: string) => s))(task.meta.status),
      C.dim(`spec v${task.meta.spec_version}`),
      C.dim(`@${task.meta.owner}`),
      C.dim(`${task.meta.steps} steps`),
      C.dim(humanAge(task.meta.updated)),
    ]
      .filter(Boolean)
      .join(' · '),
  );
  if (task.meta.collaborators.length > 1) {
    out.push(C.dim(`collaborators: ${task.meta.collaborators.map((c) => `@${c}`).join(', ')}`));
  }
  if (task.meta.sessions.length) {
    out.push(
      C.dim(
        `conversations: ${task.meta.sessions.map((x) => x.slice(0, 8)).join(', ')} · dolly continue ${task.meta.id}`,
      ),
    );
  }
  out.push(C.dim(task.dir), '');
  out.push(C.bold('Spec'), '', shortSpec(task) || C.dim('(empty)'), '');
  out.push(C.bold('Success Criteria'), '', criteria(task) || C.dim('(empty)'), '');
  out.push(C.bold('Log'), '', logSection(task) || C.dim('(empty)'));
  if (opts.full) {
    out.push('', C.bold('Full spec (context/spec.md)'), '', fullSpec(task) || C.dim('(empty)'));
    const hist = specHistory(task);
    if (hist) out.push('', C.bold('Superseded spec versions'), '', hist);
    const p = plan(task);
    if (p) out.push('', C.bold('Plan (context/plan.md)'), '', p.trim());
  }
  return out.join('\n');
}

/** sections of the brief every context carries; the rest are one `dolly project` away */
const CONTEXT_BRIEF = ['Overview', 'Invariants', 'Conventions'];
/** short-log entries shown; older ones are in task.md */
const CONTEXT_LOG = 20;

/**
 * The rehydration payload an agent reads when picking a task back up.
 * Plain markdown, no ANSI — it goes into a model's context, not a terminal.
 *
 * It is read on every pickup, so nothing is in it twice: a finalized plan is
 * already the spec, criteria already inside the full spec are not repeated,
 * and an auto-logged step keeps what the agent said, not its tool trace.
 */
export function renderContext(
  task: Task,
  opts: { steps?: number; plan?: boolean; brief?: boolean; store?: Store } = {},
): string {
  const steps = opts.brief ? 0 : (opts.steps ?? 3);
  const m = task.meta;
  const others = m.collaborators.filter((c) => c !== m.owner);
  const out: string[] = [];
  out.push(`# ${m.id} · ${m.title}`);
  out.push('');
  out.push(
    `\`${m.status}\` · spec v${m.spec_version} · @${m.owner}${others.length ? ` (+${others.map((c) => `@${c}`).join(', ')})` : ''}` +
      ` · ${m.steps} step${m.steps === 1 ? '' : 's'} · updated ${humanAge(m.updated)} · \`${task.dir}\``,
  );
  // Repo before task: this is one slice of an ongoing codebase, and an agent
  // that does not know that will happily reinvent its conventions.
  if (opts.store) {
    const brief = projectDigest(opts.store, { sections: CONTEXT_BRIEF, maxPerSection: 1500 });
    if (brief) out.push('', '## Project brief', '', brief);
    const maps = codeMapLine(opts.store.project);
    if (maps) out.push('', '## Code map available — use it before grepping', '', maps);
    const files = filesOfTask(task);
    const related = relatedByFiles(opts.store, files, m.id);
    if (related.length) {
      out.push('', '## Other tasks in this code — read their outcome before undoing it', '', renderRelated(related, 4));
    }
    if (files.length) {
      const shown = files.slice(0, 20).map((f) => `\`${f}\``).join(', ');
      out.push('', `## Files touched (${files.length})`, '', files.length > 20 ? `${shown} +${files.length - 20} more` : shown);
    }
  }
  out.push('', '## Spec (short)', '', shortSpec(task) || '_empty_');
  const crit = criteria(task);
  out.push('', '## Success Criteria', '', crit || '_empty_');
  // task.md's criteria are canonical (they carry the checkboxes, and they are
  // what `dolly spec --criteria` edits); the copy a planned spec embeds is the
  // same list again at best, a stale one at worst
  const full = /[^\s_]/.test(crit) ? withoutSection(fullSpec(task), 'Success Criteria') : fullSpec(task);
  if (full) out.push('', '## Spec (full, current)', '', demote(full));
  const p = plan(task).trim();
  if (p && opts.plan !== false) {
    // the plan is the spec's source until finalize, a duplicate of it after
    if (m.status === 'planning') out.push('', '## Plan', '', demote(p));
    else out.push('', '_Planning interview: `context/plan.md` (finalized into the spec above)._');
  }
  out.push('', '## Step log (short)', '', compactLog(logSection(task), CONTEXT_LOG) || '_empty_');
  if (opts.brief) {
    out.push(
      '',
      `_Brief view. Full context of the recent steps — decisions, rejected options, gotchas — is in \`context/steps.md\`; re-run without \`--brief\` to include it._`,
    );
    return out.join('\n');
  }
  const details = recentStepDetails(task, steps);
  if (details.length) {
    out.push('', `## Full context — last ${details.length} of ${m.steps} step(s)`);
    if (steps > 0 && m.steps > details.length) {
      out.push('', '_earlier step context is in `context/steps.md`; re-run with `-n 0` for all._');
    }
    for (const d of details) out.push('', compactStep(d.text.trim()));
  }
  return out.join('\n');
}

function withoutSection(md: string, name: string): string {
  return md.replace(new RegExp(`^##[ \\t]+${name}[ \\t]*\\n[\\s\\S]*?(?=^##[ \\t]|(?![\\s\\S]))`, 'm'), '').trim();
}

/** push a document's headings under the section that quotes it */
function demote(md: string): string {
  return md.replace(/^(#{1,5}) /gm, '#$1 ');
}

/**
 * The short log for a context: newest `max` entries, without their `files:` /
 * `full:` trailers — the files are listed once above, and the step bodies that
 * matter follow below.
 */
function compactLog(log: string, max: number): string {
  const entries: string[] = [];
  for (const line of log.split('\n')) {
    if (/^- `/.test(line)) entries.push(line);
    else if (entries.length && /^\s+/.test(line) && !/^\s+(files:|full:|previous version kept)/.test(line)) {
      entries[entries.length - 1] += `\n${line}`;
    }
  }
  // a summary is meant to be 1-3 lines; the long ones are whole in task.md
  const clipped = entries.map((e) => (e.length > 500 ? `${e.slice(0, 497).trimEnd()}…` : e));
  if (clipped.length <= max) return clipped.join('\n');
  return [`_${clipped.length - max} earlier entries in \`task.md\`._`, ...clipped.slice(-max)].join('\n');
}

/**
 * One step body, fit for a context. A hand-written note is kept whole (headings
 * demoted under the step's own). An auto-logged one — recognisable by its work
 * chain — keeps what the agent said and what it touched, and drops the tool
 * trace: that duplicated the files and commands, and was most of the bytes.
 */
export function compactStep(text: string): string {
  const t = text.replace(/^## (?!\d{4} · )/gm, '### ');
  if (!/^### (Work chain|Commands run)\b/m.test(t)) return t;
  // split on the importer's own section names only: the agent's message can
  // carry headings of its own, and those belong to "What the agent said"
  const parts = t.split(new RegExp(`^(?=### (?:${AUTO_SECTIONS.join('|')})\\b)`, 'm'));
  const kept: string[] = [];
  for (const part of parts) {
    const head = /^### (.+)$/m.exec(part)?.[1] ?? '';
    if (/^(Work chain|Commands run|Tools)\b/.test(head)) continue;
    if (/^What the agent said/.test(head)) kept.push(clipPart(part, 2000));
    else if (/^Request that opened/.test(head)) kept.push(clipPart(part.split(/\n---\n/)[0], 500));
    else kept.push(part);
  }
  return kept.join('').trim();
}

/** the sections `dolly reindex` writes into an auto-logged step */
const AUTO_SECTIONS = [
  'What the agent said it did',
  'Work chain',
  'Files touched',
  'Commands run',
  'Tools',
  'Request that opened the turn',
  'Reasoning',
];

function clipPart(part: string, max: number): string {
  const body = part.trimEnd();
  return body.length > max ? `${body.slice(0, max).trimEnd()} …\n\n` : `${body}\n\n`;
}

export const color = C;
