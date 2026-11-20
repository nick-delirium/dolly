import path from 'node:path';
import { exists } from './fsx.js';
import { codeMapLine, projectDigest, recentLessons } from './project.js';
import { mentionedBy, type Mention, type RecallHit, type RecallResult, type WhyReport } from './recall.js';
import { filesOfTask, relatedToTask, renderRelated, type RelatedTask } from './related.js';
import { isStale, tildeEncode, type Store } from './store.js';
import type { Task } from './types.js';
import {
  compactedFile,
  criteria,
  fullSpec,
  logSection,
  plan,
  recentStepDetails,
  rollupEntries,
  shortSpec,
  stepEntries,
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
    for (const t of group) out.push(`  ${taskLine(t, isStale(t, store.config) && status !== store.config.reviewStatus)}`);
    out.push('');
    printed += group.length;
  }

  if (!printed) out.push(C.dim('no tasks — `dolly new "<title>"` or `dolly plan start "<idea>"`'));
  // agents may not close tasks, so the queue only drains if a human sees it —
  // and its age is what makes "15 waiting" read as a problem, not a number
  const waiting = tasks
    .filter((t) => t.meta.status === store.config.reviewStatus)
    .sort((a, b) => a.meta.updated.localeCompare(b.meta.updated));
  if (waiting.length) {
    const oldest = waiting.length > 1 ? `, oldest ${humanAge(waiting[0].meta.updated).replace(/ ago$/, '')}` : '';
    out.push(C.dim(`${waiting.length} awaiting a human${oldest} — \`dolly review\` walks them in a terminal`));
  }
  const idle = tasks.filter((t) => t.meta.status !== store.config.reviewStatus && isStale(t, store.config)).length;
  if (idle) {
    out.push(
      C.dim(
        `${idle} open task${idle === 1 ? '' : 's'} idle over ${store.config.staleDays}d — no longer offered as current. ` +
          'Pick one up: `dolly status <ref> working`; shelve it: `dolly status <ref> todo`.',
      ),
    );
  }
  return out.join('\n');
}

function taskLine(t: Task, stale = false): string {
  const bits = [
    C.bold(t.meta.id),
    t.meta.title,
    C.dim(`@${t.meta.owner}`),
    stale ? C.yellow(`idle ${humanAge(t.meta.updated || t.meta.created).replace(/ ago$/, '')}`) : C.dim(humanAge(t.meta.updated || t.meta.created)),
    C.dim(`${t.meta.steps}✎`),
  ];
  if (t.meta.spec_version > 1) bits.push(C.dim(`spec v${t.meta.spec_version}`));
  if (t.meta.tags.length) bits.push(C.dim(t.meta.tags.map((x) => `#${x}`).join(' ')));
  return bits.join('  ');
}

/**
 * Sections of the brief a full context carries; the rest are one `dolly
 * project` away. Not Overview: session start already injected it (and
 * re-injects it after a compaction), so here it was the same 700 bytes again.
 * Lessons come along too, but newest-first (`recentLessons`).
 */
const CONTEXT_BRIEF = ['Invariants', 'Conventions'];
/** short-log entries shown; older ones are in task.md */
const CONTEXT_LOG = 20;
/** step bodies out of view before the context suggests a rollup */
const COMPACT_NUDGE = 10;

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
    // the brief view orients on the task; the repo's rules come with the full
    // read, right before code is written
    // Lessons are rules learned from mistakes — worth their bytes in the read
    // right before code is written, newest first within a budget
    const lessons = opts.brief ? '' : recentLessons(opts.store);
    const brief = opts.brief
      ? ''
      : projectDigest(opts.store, { sections: CONTEXT_BRIEF, maxPerSection: 1500, shownElsewhere: lessons ? ['Lessons'] : [] });
    if (brief || lessons) {
      out.push('', '## Project brief');
      if (brief) out.push('', brief);
      if (lessons) out.push('', '### Lessons — do not repeat these', '', lessons);
    }
    const maps = codeMapLine(opts.store.project);
    if (maps) out.push('', '## Code map available — use it before grepping', '', maps);
    const files = filesOfTask(task);
    const related = relatedToTask(opts.store, task);
    if (related.length) {
      out.push('', '## Other tasks in this code — read their outcome before undoing it', '', renderRelated(related, opts.brief ? 2 : 4));
    }
    const mentions = mentionedBy(opts.store, task);
    if (mentions.length) out.push('', '## Mentioned by other tasks', '', renderMentions(mentions));
    if (files.length) {
      const shown = files.slice(0, 20).map((f) => `\`${f}\``).join(', ');
      out.push('', `## Files touched (${files.length})`, '', files.length > 20 ? `${shown} +${files.length - 20} more` : shown);
    }
  }
  const crit = criteria(task);
  // task.md's criteria are canonical (they carry the checkboxes, and they are
  // what `dolly spec --criteria` edits); the copy a planned spec embeds is the
  // same list again at best, a stale one at worst
  const full = /[^\s_]/.test(crit) ? withoutSection(fullSpec(task), 'Success Criteria') : fullSpec(task);
  // a finalized plan derives the short spec from the full one's Goal and
  // Scope: with the full spec right below, it is the same text again (~1KB on
  // every pickup). A short spec someone rewrote since does not match, and stays.
  const short = shortSpec(task);
  const lead = short.split(/\n\s*\n/)[0]?.trim() ?? '';
  const squash = (x: string) => x.replace(/\s+/g, ' ');
  // the brief view is the short spec, never the full one: the full spec was
  // most of its bytes, and it is exactly what the full read is for
  if (opts.brief || !(full && lead && squash(full).includes(squash(lead)))) out.push('', '## Spec (short)', '', short || '_empty_');
  out.push('', '## Success Criteria', '', crit || '_empty_');
  if (full && !opts.brief) out.push('', '## Spec (full, current)', '', demote(full));
  const p = plan(task).trim();
  if (p && opts.plan !== false) {
    // the plan is the spec's source until finalize, a duplicate of it after
    if (m.status === 'planning') out.push('', '## Plan', '', demote(p));
    else out.push('', '_Planning interview: `context/plan.md` (finalized into the spec above)._');
  }
  out.push('', '## Step log (short)', '', compactLog(logSection(task), opts.brief ? CONTEXT_LOG / 2 : CONTEXT_LOG) || '_empty_');
  // the rollup is what the early steps established — orientation, so it is in
  // the brief view too; only the newest one is live
  const rollup = rollupEntries(task.dir).pop();
  if (rollup) {
    const covers = /^- covers: steps (\S+)/m.exec(rollup.text)?.[1] ?? '';
    out.push('', `## Rollup${covers ? ` of steps ${covers}` : ''} — what the earlier steps established`, '', compactStep(rollup.text));
  }
  if (opts.brief) {
    // pointing at context that does not exist made the brief view of a fresh
    // task longer than the full one
    if (stepEntries(task.dir).length || full) {
      out.push(
        '',
        `_Brief view: short spec, recent log. The full spec, the repo's invariants and the recent steps' full context come without \`--brief\`._`,
      );
    }
    return out.join('\n');
  }
  const details = recentStepDetails(task, steps);
  if (details.length) {
    out.push('', `## Full context — last ${details.length} of ${m.steps} step(s)`);
    if (steps > 0 && m.steps > details.length) {
      const moved = exists(compactedFile(task.dir)) ? ', rolled-up ones in `context/steps.compacted.md`' : '';
      out.push('', `_earlier step context is in \`context/steps.md\`${moved}; re-run with \`-n 0\` for all live steps._`);
    }
    for (const d of details) out.push('', compactStep(d.text.trim()));
    const unseen = stepEntries(task.dir).length - details.length;
    if (steps > 0 && unseen >= COMPACT_NUDGE) {
      out.push('', `_${unseen} older step bodies are out of view — \`dolly compact ${m.id}\` rolls them into one note that stays here._`);
    }
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

/* --------------------------------- recall -------------------------------- */

/** a path an agent can open from where it stands: relative inside cwd, else ~ */
export function shownPath(p: string, cwd = process.cwd()): string {
  const rel = path.relative(cwd, p);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : tildeEncode(p);
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

function hitLabel(h: RecallHit): string {
  const head = h.heading && h.heading !== h.task?.meta.title ? ` › ${clip(h.heading, 60)}` : '';
  const when = h.kind === 'log' ? ` ${h.at.slice(0, 10)}` : '';
  return `${h.label}${when}${head}`;
}

function groupKey(h: RecallHit, multi: boolean): { key: string; title: string } {
  const proj = multi ? `[${path.basename(h.store.project)}] ` : '';
  if (h.task) {
    const t = h.task.meta;
    return { key: `${h.store.root}|${t.id}`, title: `${proj}${t.id} ${t.title} (${t.status})` };
  }
  return { key: `${h.store.root}|${h.label}`, title: `${proj}${h.label}` };
}

/**
 * Hits grouped by task, in the order of each task's best hit. `cap` bounds the
 * bytes: this lands in an agent's context, and a broad word should cost the
 * same as a precise one — the rest is one `-n` or `--json` away.
 */
export function renderRecall(query: string, res: RecallResult, opts: { cap?: number; multi?: boolean } = {}): string {
  const fixes = Object.entries(res.fuzzy).map(([a, b]) => `${a}→${b}`);
  const head = [
    `recall ${query.includes('"') ? query : `"${query}"`} — ${res.total} match${res.total === 1 ? '' : 'es'}${res.hits.length < res.total ? `, top ${res.hits.length}` : ''}`,
    fixes.length ? ` · fuzzy: ${fixes.join(', ')}` : '',
  ].join('');
  if (!res.hits.length) return `${head}\n\nnothing in the store mentions that — try other words, or --all-projects`;

  const groups = new Map<string, { title: string; hits: RecallHit[] }>();
  for (const h of res.hits) {
    const g = groupKey(h, Boolean(opts.multi));
    if (!groups.has(g.key)) groups.set(g.key, { title: g.title, hits: [] });
    groups.get(g.key)!.hits.push(h);
  }
  const blocks: string[] = [];
  for (const g of groups.values()) {
    const lines = [C.bold(g.title)];
    for (const h of g.hits) {
      lines.push(`  ${hitLabel(h)} · ${shownPath(h.file)}:${h.line}`, `    ${h.snippet}`);
    }
    blocks.push(lines.join('\n'));
  }
  const tail = 'open a hit at its line · more: -n N, --json, --kind decision, --all-projects';
  let out = [head, '', blocks.join('\n'), '', C.dim(tail)].join('\n');
  if (opts.cap && Buffer.byteLength(out) > opts.cap) {
    // drop whole hits from the end until it fits, and say how many
    const kept: string[] = [];
    let size = Buffer.byteLength(head) + Buffer.byteLength(tail) + 80;
    let shown = 0;
    for (const b of blocks) {
      const parts = b.split('\n');
      const title = parts[0];
      const body: string[] = [];
      for (let i = 1; i + 1 < parts.length; i += 2) {
        const add = Buffer.byteLength(parts[i]) + Buffer.byteLength(parts[i + 1]) + 2 + (body.length ? 0 : Buffer.byteLength(title) + 1);
        if (size + add > opts.cap) break;
        size += add;
        body.push(parts[i], parts[i + 1]);
        shown++;
      }
      if (body.length) kept.push([title, ...body].join('\n'));
      if (body.length < parts.length - 1) break;
    }
    out = [head, '', kept.join('\n'), '', C.dim(`+${res.hits.length - shown} more hidden to keep this short — ${tail}`)].join('\n');
  }
  return out;
}

export function renderMentions(mentions: Mention[], limit = 5): string {
  const out = mentions.slice(0, limit).map((m) => {
    const t = m.task.meta;
    return `- **${t.id} ${t.title}** (${t.status}) — ${clip(m.text, 120)}`;
  });
  if (mentions.length > limit) out.push(`- _+${mentions.length - limit} more_`);
  return out.join('\n');
}

/** tasks a single-file `why` shows in full; past this each shows its newest step only */
const WHY_TASKS = 6;
const WHY_COMMITS = 8;

export function renderWhy(w: WhyReport): string {
  const out: string[] = [C.bold(`why ${w.file}`)];
  if (!w.touched.length && !w.commits.length && !w.prose.length) {
    out.push('', 'no task recorded this file and no commit touched it — it has no recorded history');
    return out.join('\n');
  }
  // A hub file (cli.ts) has been through most tasks: listing all of them cost
  // 10KB of history to say "everyone". The newest few are the ones a change is
  // likely to collide with; the rest are counted, and `--json` has them all.
  if (w.touched.length) {
    out.push('', `Changed by ${w.touched.length} task(s), newest first`);
    const many = w.touched.length > WHY_TASKS;
    for (const { task, entries } of w.touched.slice(0, WHY_TASKS)) {
      out.push(`- ${C.bold(`${task.meta.id} ${task.meta.title}`)} (${task.meta.status})`);
      const per = many ? 1 : 3;
      for (const e of entries.slice(-per)) {
        out.push(`    ${e.at.slice(0, 10)}: ${clip(e.text, 200)}${e.ref ? C.dim(` · steps.md#${e.ref}`) : ''}`);
      }
      if (entries.length > per) out.push(C.dim(`    +${entries.length - per} earlier step(s) — dolly context ${task.meta.id}`));
    }
    if (many) out.push(C.dim(`- +${w.touched.length - WHY_TASKS} older task(s) — \`--json\` lists every one`));
  }
  if (w.commits.length) {
    out.push('', `Commits (${w.commits.length}, newest first)`);
    for (const c of w.commits.slice(0, WHY_COMMITS)) {
      out.push(`- ${c.hash} ${c.date} ${clip(c.subject, 90)}${c.tasks.length ? ` → ${c.tasks.join(', ')}` : ''}`);
    }
    if (w.commits.length > WHY_COMMITS) out.push(C.dim(`- +${w.commits.length - WHY_COMMITS} older — git log -- ${w.file}`));
  }
  if (w.prose.length) {
    out.push('', 'Prose naming it');
    for (const h of w.prose) {
      const who = h.task ? `${h.task.meta.id} ` : '';
      out.push(`- ${who}${hitLabel(h)} · ${shownPath(h.file)}:${h.line}`, `    ${h.snippet}`);
    }
  }
  return out.join('\n');
}

/** `why` over several files: the tasks across them, strongest first, then their commits */
export function renderWhyMany(reports: WhyReport[], related: RelatedTask[]): string {
  const out: string[] = [C.bold(`why ${reports.map((r) => r.file).join(', ')}`)];
  if (related.length) {
    out.push('', 'Tasks in this code, strongest first (a rare shared file outweighs a hub)', '', renderRelated(related, 8));
  } else {
    out.push('', 'no task recorded any of these files');
  }
  const seen = new Set<string>();
  const commits = reports
    .flatMap((r) => r.commits)
    .filter((c) => !seen.has(c.hash) && seen.add(c.hash))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  if (commits.length) {
    out.push('', `Commits (${commits.length}, newest first)`);
    for (const c of commits.slice(0, 10)) {
      out.push(`- ${c.hash} ${c.date} ${clip(c.subject, 90)}${c.tasks.length ? ` → ${c.tasks.join(', ')}` : ''}`);
    }
    if (commits.length > 10) out.push(C.dim(`- +${commits.length - 10} more — \`dolly why <one file>\` for its full story`));
  }
  return out.join('\n');
}
