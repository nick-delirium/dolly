/**
 * Compaction: an agent-written rollup that keeps a long task's early decisions
 * in view after its step bodies scroll out of `dolly context`, and digests that
 * do the same for an area several tasks built together.
 *
 * dolly writes no prose — it never needs a model. It hands the agent the
 * material and the rules (print), then stores what the agent wrote (save).
 * Nothing is deleted: rolled-up bodies move verbatim to steps.compacted.md,
 * digested tasks stay exactly where they are.
 */
import { exists, readTextOr, writeText } from './fsx.js';
import { digestFile, readDigest, type Digest } from './digest.js';
import { allBlocks, setBlock, stringifyFrontmatter } from './md.js';
import { compactStep } from './render.js';
import { slugify, type Store } from './store.js';
import {
  addRollup,
  fullSpec,
  logSection,
  rollupEntries,
  setDigest,
  shortSpec,
  stepEntries,
  stepsFile,
  type StepEntry,
} from './task.js';
import { nowIso } from './time.js';
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

function stepId(raw: string): string {
  if (!/^\d{1,4}$/.test(raw.trim())) throw new Error(`--through takes a step number like 0026, not "${raw}"`);
  return raw.trim().padStart(4, '0');
}

/**
 * Which live bodies a rollup takes. `through` pins the range so a step logged
 * between printing the material and saving the rollup stays live — the agent
 * never summarised it.
 */
export function planCompaction(task: Task, opts: { keep?: number; through?: string } = {}): CompactPlan {
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
    const want = stepId(opts.through);
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
  const prevFrom = rollups.map((r) => /^- covers: steps (\d+)–/m.exec(r.text)?.[1]).find(Boolean);
  return {
    task,
    steps,
    rollups,
    kept: live.length - steps.length,
    from: prevFrom ?? steps[0].id,
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
    `Roll up steps ${p.from}–${p.through}: ${p.steps.length} step ${bodies}${p.rollups.length ? ' and the previous rollup' : ''} → one note. ` +
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
  const plan = planCompaction(task, opts);
  const n = addRollup(store, task, {
    prose,
    covered: [...plan.rollups.map((r) => `rollup ${r.id}`), ...plan.steps.map((s) => `step ${s.id}`)],
    from: plan.from,
    through: plan.through,
  });
  return { n, plan };
}

/* --------------------------------- digests ------------------------------- */

const DIGEST_RULES = [
  '- What is TRUE about this area now, across these tasks: how it works, why it is shaped so, decisions + reasons, rejected paths, gotchas, what is still open.',
  '- By topic, not by task. Cite a task id where a reader should dig (`twjnrqcd`).',
  '- Paths, ids, flags exact. Shape: `### How it works` · `### Decisions` · `### Dead ends` · `### Open`.',
];

const NO_HISTORY = '_none — this is the first version_';

/** the tasks a digest may take: two or more, none already in another digest */
export function checkDigestTasks(tasks: Task[], title: string): string {
  const slug = slugify(title);
  if (!slug) throw new Error('a digest needs a --title');
  const ids = new Set(tasks.map((t) => t.meta.id));
  if (ids.size < 2) throw new Error('a digest rolls up two or more tasks — for one task, `dolly compact <ref>`');
  const taken = tasks.filter((t) => t.meta.digest && t.meta.digest !== slug);
  if (taken.length) {
    throw new Error(
      `${taken.map((t) => `${t.meta.id} is already in digest ${t.meta.digest}`).join('; ')} — a task belongs to one digest; use that digest's --title`,
    );
  }
  return slug;
}

export function digestMaterial(store: Store, tasks: Task[], title: string): string {
  const slug = checkDigestTasks(tasks, title);
  const prev = readDigest(digestFile(store, slug));
  const out = [
    `# Digest · ${title}`,
    '',
    `${tasks.length} tasks → one note at \`digests/${slug}.md\`. The tasks stay as they are; the board folds the finished ones under the digest, and context/related point at it.`,
    '',
    '## Write the digest',
    '',
    ...DIGEST_RULES,
    '',
    `Save: \`dolly compact --tasks ${tasks.map((t) => t.meta.id).join(',')} --title "${title}" --save --file <digest.md>\` (\`--file -\` reads stdin).`,
  ];
  if (prev?.body) out.push('', '## Current version (replace it; it is kept as history)', '', demote(prev.body));
  out.push('', '## Source');
  for (const t of tasks) {
    const m = t.meta;
    out.push('', `### ${m.id} · ${m.title} (${m.status})`, '', shortSpec(t) || '_no short spec_');
    const full = fullSpec(t).trim();
    if (full) out.push('', '#### Spec', '', demote(demote(demote(full))));
    out.push('', '#### Log', '', logSection(t).trim() || '_empty_');
    for (const b of [...rollupEntries(t.dir), ...stepEntries(t.dir)]) out.push('', demote(demote(compactStep(b.text))));
  }
  return out.join('\n');
}

function digestDoc(d: Omit<Digest, 'file'>, coversLine: string, history: string): string {
  const front = stringifyFrontmatter({
    slug: d.slug,
    title: d.title,
    covers: d.covers,
    created: d.created,
    updated: d.updated,
    by: d.by,
  });
  const body = [
    '',
    `# Digest · ${d.title}`,
    '',
    coversLine,
    '',
    '<!-- dolly:digest -->',
    '<!-- /dolly:digest -->',
    '',
    '---',
    '',
    '## Previous versions',
    '',
    '<!-- dolly:digest-history -->',
    '<!-- /dolly:digest-history -->',
    '',
  ].join('\n');
  return front + setBlock(setBlock(body, 'digest', d.body), 'digest-history', history);
}

/**
 * Write (or re-write) a digest, then stamp each task with it. The file first:
 * a crash before the stamps leaves a digest some tasks do not point at yet, and
 * saving again finishes the job without stacking a duplicate history entry.
 */
export function saveDigest(store: Store, tasks: Task[], title: string, prose: string): Digest {
  const body = prose.trim();
  if (!body) throw new Error('refusing to save an empty digest');
  const slug = checkDigestTasks(tasks, title);
  const file = digestFile(store, slug);
  const prev = readDigest(file);
  const covers = [...new Set([...(prev?.covers ?? []), ...tasks.map((t) => t.meta.id)])];
  const byId = new Map(store.loadTasks().map((t) => [t.meta.id, t]));
  const coversLine = `Covers: ${covers
    .map((id) => {
      const t = byId.get(id);
      return t ? `\`${id}\` ${t.meta.title} (${t.meta.status})` : `\`${id}\``;
    })
    .join(' · ')}`;

  let history = NO_HISTORY;
  if (prev) {
    const old = readTextOr(file);
    const kept = /<!-- dolly:digest-history -->\n([\s\S]*?)\n<!-- \/dolly:digest-history -->/.exec(old)?.[1]?.trim() ?? '';
    const earlier = kept && kept !== NO_HISTORY ? `\n\n${kept}` : '';
    history = prev.body.trim() && prev.body.trim() !== body ? `## ${prev.updated} · @${prev.by}\n\n${prev.body.trim()}${earlier}` : kept || NO_HISTORY;
  }
  const now = nowIso();
  const d = { slug, title, covers, created: prev?.created || now, updated: now, by: store.user, body };
  if (!exists(file) || readDigest(file)?.body.trim() !== body || prev?.covers.length !== covers.length) {
    writeText(file, digestDoc(d, coversLine, history));
  }
  for (const t of tasks) setDigest(store, t, slug);
  return { ...d, file };
}
