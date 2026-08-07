import { codeMapLine, projectDigest } from './project.js';
import { filesOfTask, relatedToTask, renderRelated } from './related.js';
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

export function renderBoard(
  store: Store,
  tasks: Task[],
  opts: { showArchived?: boolean } = {},
): string {
  const out: string[] = [];
  const header = `dolly · ${store.root}${store.kind === 'global' ? C.dim(' (global store)') : ''}`;
  out.push(C.bold(header), '');

  const statuses = [...store.config.statuses];
  for (const t of tasks) if (!statuses.includes(t.meta.status)) statuses.push(t.meta.status);

  let printed = 0;
  for (const status of statuses) {
    const group = tasks.filter((t) => t.meta.status === status && !t.archived);
    if (!group.length) continue;
    const style = STATUS_STYLE[status] ?? ((s: string) => s);
    out.push(style(`${STATUS_ICON[status] ?? '·'} ${status.toUpperCase()}  ${C.dim(`(${group.length})`)}`));
    for (const t of group) out.push(`  ${taskLine(t)}`);
    out.push('');
    printed += group.length;
  }

  if (opts.showArchived) {
    const arch = tasks.filter((t) => t.archived);
    if (arch.length) {
      out.push(C.dim(`⌸ ARCHIVED  (${arch.length})`));
      for (const t of arch) out.push(`  ${taskLine(t)}`);
      out.push('');
      printed += arch.length;
    }
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
  if (t.meta.stale) bits.push(C.red('stale'));
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
      task.archived ? C.dim('archived') : '',
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

/**
 * The rehydration payload an agent reads when picking a task back up.
 * Plain markdown, no ANSI — it goes into a model's context, not a terminal.
 */
export function renderContext(
  task: Task,
  opts: { steps?: number; plan?: boolean; brief?: boolean; store?: Store } = {},
): string {
  const steps = opts.brief ? 0 : (opts.steps ?? 3);
  const out: string[] = [];
  out.push(`# dolly context · ${task.meta.id} ${task.meta.title}`);
  out.push('');
  out.push(
    [
      `- status: **${task.meta.status}**`,
      `- spec version: v${task.meta.spec_version}`,
      `- owner: @${task.meta.owner}`,
      `- collaborators: ${task.meta.collaborators.map((c) => `@${c}`).join(', ') || '—'}`,
      `- steps logged: ${task.meta.steps}`,
      `- created: ${task.meta.created}`,
      `- updated: ${task.meta.updated}`,
      `- dir: ${task.dir}`,
    ].join('\n'),
  );
  // Repo before task: this is one slice of an ongoing codebase, and an agent
  // that does not know that will happily reinvent its conventions.
  if (opts.store) {
    const brief = projectDigest(opts.store);
    if (brief) out.push('', '## Project brief (repo-level, task-independent)', '', brief);
    const maps = codeMapLine(opts.store.project);
    if (maps) {
      out.push('', '## Code map available — use it before grepping', '', maps);
    }
    const related = relatedToTask(opts.store, task);
    if (related.length) {
      out.push(
        '',
        '## Other tasks in this code',
        '',
        'These touched the same files. Read their outcomes before changing shared code —',
        'they may have decided something you are about to undo.',
        '',
        renderRelated(related),
      );
    }
    const files = filesOfTask(task);
    if (files.length) {
      out.push('', `## Files this task has touched (${files.length})`, '', files.map((f) => `- \`${f}\``).join('\n'));
    }
  }
  out.push('', '## Spec (short)', '', shortSpec(task) || '_empty_');
  out.push('', '## Success Criteria', '', criteria(task) || '_empty_');
  const full = fullSpec(task);
  if (full) out.push('', '## Spec (full, current)', '', full);
  if (opts.plan !== false) {
    const p = plan(task);
    if (p.trim()) out.push('', '## Plan', '', p.trim());
  }
  out.push('', '## Step log (short)', '', logSection(task) || '_empty_');
  if (opts.brief) {
    out.push(
      '',
      `_Brief view. Full context of the recent steps — decisions, rejected options, gotchas — is in \`context/steps.md\`; re-run without \`--brief\` to include it._`,
    );
    return out.join('\n');
  }
  const details = recentStepDetails(task, steps);
  if (details.length) {
    const total = task.meta.steps;
    out.push(
      '',
      `## Full context — last ${details.length} of ${total} step(s)`,
      '',
      steps > 0 && total > details.length
        ? `_earlier step context is in \`context/steps.md\`; re-run with \`-n 0\` for all._`
        : '',
    );
    for (const d of details) out.push('', d.text.trim());
  }
  return out.join('\n');
}

export const color = C;
