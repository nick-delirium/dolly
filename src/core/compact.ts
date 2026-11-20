/**
 * Compaction: an agent-written rollup that keeps a long task's early decisions
 * in view after its step bodies scroll out of `dolly context`. (What several
 * tasks added up to is a dream's job now — see dream.ts.)
 *
 * dolly writes no prose — it never needs a model. It hands the agent the
 * material and the rules (print), then stores what the agent wrote (save).
 * Nothing is deleted: rolled-up bodies move verbatim to steps.compacted.md.
 */
import { readTextOr } from './fsx.js';
import { allBlocks } from './md.js';
import { compactStep } from './render.js';
import type { Store } from './store.js';
import { addRollup, rollupEntries, shortSpec, stepsFile, type StepEntry } from './task.js';
import type { Task } from './types.js';

/** step bodies left in full by default — the same three `dolly context` shows */
export const DEFAULT_KEEP = 3;

export interface CompactPlan {
  task: Task;
  /** live step blocks the rollup replaces, oldest first */
  steps: StepEntry[];
  /** live rollups it supersedes */
  rollups: StepEntry[];
  /** live step bodies left in full */
  kept: number;
  from: string;
  through: string;
}

/**
 * A step as the user names it: the full block id (`0026-alice`, what the
 * material prints) or the bare number. A bare number shared by several
 * authors — two teammates' step 26 after a merge — resolves to the current
 * user's, and is refused with the candidates when that does not settle it.
 */
export function resolveStepId(ids: string[], raw: string, user?: string): string {
  const want = raw.trim();
  if (ids.includes(want)) return want;
  if (!/^\d{1,4}$/.test(want)) throw new Error(`--through takes a step number like 0026 (or the full id, 0026-<author>), not "${raw}"`);
  const n = want.padStart(4, '0');
  const hits = ids.filter((id) => id === n || id.startsWith(`${n}-`));
  if (hits.length === 1) return hits[0];
  const mine = user ? hits.filter((id) => id === `${n}-${user.replace(/[^A-Za-z0-9._-]+/g, '-')}`) : [];
  if (mine.length === 1) return mine[0];
  if (!hits.length) return n; // reported as missing by the caller, with the live span
  throw new Error(`step ${n} is ambiguous — ${hits.join(', ')}; pass the full id`);
}

/**
 * Which live bodies a rollup takes. `through` pins the range so a step logged
 * between printing the material and saving the rollup stays live — the agent
 * never summarised it.
 */
export function planCompaction(task: Task, opts: { keep?: number; through?: string; user?: string } = {}): CompactPlan {
  const live = allBlocks(readTextOr(stepsFile(task.dir)), 'step');
  const dup = live.find((b, i) => live.findIndex((c) => c.id === b.id) !== i);
  if (dup) {
    throw new Error(
      `steps.md holds step ${dup.id} twice (two branches merged?) — renumber one by hand before compacting; dolly will not guess which is which`,
    );
  }
  const keep = opts.keep ?? DEFAULT_KEEP;
  if (!Number.isInteger(keep) || keep < 0) throw new Error('--keep takes a whole number, 0 or more');
  let last: number;
  if (opts.through !== undefined) {
    const want = resolveStepId(live.map((b) => b.id), opts.through, opts.user);
    last = live.findIndex((b) => b.id === want);
    if (last === -1) {
      const span = live.length ? `${live[0].id}–${live[live.length - 1].id}` : 'none';
      throw new Error(`no live step ${want} in steps.md (live: ${span})`);
    }
    if (last >= live.length - keep) {
      throw new Error(`step ${want} is inside the last ${keep} kept in full — pass --keep ${live.length - 1 - last} or an earlier --through`);
    }
  } else {
    last = live.length - keep - 1;
    if (last < 0) {
      throw new Error(`nothing to compact: ${live.length} step bod${live.length === 1 ? 'y' : 'ies'} in steps.md, and the last ${keep} stay in full`);
    }
  }
  const steps = live.slice(0, last + 1);
  const rollups = rollupEntries(task.dir);
  // a new rollup speaks for everything the one it replaces did
  const prevFrom = rollups.map((r) => /^- covers: steps (\S+?)–/m.exec(r.text)?.[1]).find(Boolean);
  return {
    task,
    steps,
    rollups,
    kept: live.length - steps.length,
    // `from` is for reading — the number; `through` pins the range, so it is the id
    from: (prevFrom ?? steps[0].id).replace(/-.*$/, ''),
    through: steps[steps.length - 1].id,
  };
}

/** push a document's headings one level down, under the heading quoting it */
function demote(md: string): string {
  return md.replace(/^(#{1,5}) /gm, '#$1 ');
}

const ROLLUP_RULES = [
  '- Keep what is still TRUE and still matters to the next agent: decisions + why, options rejected, gotchas, conventions set, open threads.',
  '- Final state, not a diary: fold corrections into what ended up true; drop "then I…".',
  '- Paths, ids, flags, commands exact. Name a step (`0007`) when its full body is worth opening.',
  '- Shape: `### State` · `### Decisions` · `### Dead ends` · `### Open`. Aim for under 40% of the source.',
];

export function rollupMaterial(p: CompactPlan): string {
  const m = p.task.meta;
  const bodies = p.steps.length === 1 ? 'body' : 'bodies';
  const out = [
    `# Compact ${m.id} · ${m.title}`,
    '',
    `Roll up steps ${p.from}–${p.through.replace(/-.*$/, '')}: ${p.steps.length} step ${bodies}${p.rollups.length ? ' and the previous rollup' : ''} → one note. ` +
      `The last ${p.kept} stay in full. The originals move verbatim to \`context/steps.compacted.md\`; \`dolly recall\` still searches them.`,
    '',
    '## Write the rollup',
    '',
    ...ROLLUP_RULES,
    '',
    `Save: \`dolly compact ${m.id} --through ${p.through} --save --file <rollup.md>\` (\`--file -\` reads stdin).`,
    '',
    '## Spec (short)',
    '',
    shortSpec(p.task) || '_empty_',
    '',
    '## Source',
  ];
  for (const b of [...p.rollups, ...p.steps]) out.push('', demote(compactStep(b.text)));
  return out.join('\n');
}

/**
 * `through` is required: re-planning at save time would silently widen the
 * range over a step logged after the material was printed — a step the
 * agent's prose never covered.
 */
export function saveRollup(
  store: Store,
  task: Task,
  prose: string,
  opts: { keep?: number; through: string },
): { n: number; plan: CompactPlan } {
  if (!opts.through) throw new Error('saving a rollup needs --through: the last step the material showed (it is in the printed save command)');
  const plan = planCompaction(task, { ...opts, user: store.user });
  const n = addRollup(store, task, {
    prose,
    covered: [...plan.rollups.map((r) => `rollup ${r.id}`), ...plan.steps.map((s) => `step ${s.id}`)],
    from: plan.from,
    through: plan.through,
  });
  return { n, plan };
}
