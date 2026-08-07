import { readTextOr, writeText } from './fsx.js';
import { getSection, sectionNames, setSection, appendToSection } from './md.js';
import type { Store } from './store.js';
import type { Task } from './types.js';
import { createTask, planFile, saveTask, touch, updateSpec, SEC_LOG } from './task.js';
import { nowIso, shortStamp } from './time.js';

const TBD = /^_?\s*(tbd|todo|\?+|n\/a\s*\?)\s*_?$/i;

const PROMPTS: Record<string, string> = {
  Problem: 'What hurts today? Who feels it? Evidence (bug, metric, quote).',
  Goal: 'One paragraph: what is true after this ships.',
  Scope: 'In: things this change touches. Out: things it explicitly does not.',
  'Success Criteria': 'Checkable statements. Each must be verifiable by a human or a test.',
  Changes: 'Files, modules, schemas, configs, migrations. Guesses fine — mark them.',
  Risks: 'What can break, what is uncertain, what needs a fallback.',
  'Test Plan': 'Unit / integration / manual. Name the cases, not the framework.',
  'Open Questions': 'Anything blocking. Check the box once answered, log answer in Q&A.',
};

function seedFor(name: string): string {
  if (name === 'Scope') return '**In:**\n\n- _TBD_\n\n**Out:**\n\n- _TBD_';
  if (name === 'Success Criteria') return '- [ ] _TBD_';
  if (name === 'Open Questions') return '- [ ] _TBD_';
  return '_TBD_';
}

export function renderPlanTemplate(store: Store, title: string, brief: string): string {
  const out: string[] = [
    `<!-- dolly plan · created ${nowIso()} · @${store.user} -->`,
    `# Plan — ${title}`,
    '',
    '> Interview record. Every section below must be answered before `dolly plan finalize`.',
    `> Gate: \`dolly plan check\` fails while a section is empty, \`_TBD_\`, or an Open Question is unchecked.`,
    '',
    '## Brief',
    '',
    brief.trim() || '_TBD_',
    '',
  ];
  for (const name of store.config.planSections) {
    out.push(`## ${name}`, '', `<!-- ask: ${PROMPTS[name] ?? 'Fill this in.'} -->`, '', seedFor(name), '');
  }
  out.push('## Q&A', '', '_none yet_', '');
  return out.join('\n');
}

export function startPlan(store: Store, title: string, brief: string): Task {
  const task = createTask(store, {
    title,
    status: 'planning',
    specShort: '_planning in progress — see `context/plan.md`_',
    specFull: `# ${title}\n\n_Spec is being written by the planning interview. See \`plan.md\`._`,
  });
  writeText(planFile(task.dir), renderPlanTemplate(store, title, brief));
  return task;
}

export function readPlan(task: Task): string {
  return readTextOr(planFile(task.dir));
}

export function setPlanSection(store: Store, task: Task, section: string, text: string): void {
  const src = readPlan(task);
  if (!src) throw new Error(`no plan for task ${task.meta.id} — run \`dolly plan start\` first`);
  const known = sectionNames(src);
  const match = known.find((n) => n.toLowerCase() === section.toLowerCase());
  const next = setSection(src, match ?? section, text.trim());
  writeText(planFile(task.dir), next);
  touch(task, store.user);
  saveTask(task);
}

export function addPlanQA(store: Store, task: Task, question: string, answer: string): void {
  const src = readPlan(task);
  if (!src) throw new Error(`no plan for task ${task.meta.id}`);
  const entry = [`**Q (${shortStamp()}):** ${question.trim()}`, '', `**A:** ${answer.trim()}`].join('\n');
  writeText(planFile(task.dir), appendToSection(src, 'Q&A', entry));
  touch(task, store.user);
  saveTask(task);
}

export interface PlanCheck {
  ok: boolean;
  missing: string[];
  openQuestions: string[];
  prompts: Record<string, string>;
}

function isBlank(text: string | null): boolean {
  if (!text) return true;
  const lines = text
    .split('\n')
    .map((l) => l.replace(/^<!--[\s\S]*?-->$/, '').trim())
    .filter(Boolean)
    .filter((l) => !l.startsWith('<!--'));
  if (!lines.length) return true;
  const meaningful = lines
    // bold sub-labels like `**In:**` are structure, not an answer — drop before
    // stripping bullets, otherwise the leading `*` looks like a list marker
    .map((l) => l.replace(/^\*\*[^*]*\*\*:?$/, '').trim())
    .map((l) => l.replace(/^[-*]\s+(\[[ xX]\]\s*)?/, '').trim())
    .filter(Boolean);
  if (!meaningful.length) return true;
  return meaningful.every((l) => TBD.test(l));
}

export function checkPlan(store: Store, task: Task): PlanCheck {
  const src = readPlan(task);
  const missing: string[] = [];
  const openQuestions: string[] = [];
  if (!src) {
    return {
      ok: false,
      missing: ['(no plan file)'],
      openQuestions: [],
      prompts: PROMPTS,
    };
  }
  for (const name of store.config.planSections) {
    const body = getSection(src, name);
    if (isBlank(body)) missing.push(name);
  }
  const oq = getSection(src, 'Open Questions') ?? '';
  const isNone = /^_?\s*(none|no open questions|n\/a)\s*\.?_?$/im.test(oq.trim());
  if (!isNone) {
    for (const line of oq.split('\n')) {
      const m = /^[-*]\s*\[\s\]\s*(.+)$/.exec(line.trim());
      if (m && !TBD.test(m[1].trim())) openQuestions.push(m[1].trim());
    }
  }
  return {
    ok: missing.length === 0 && openQuestions.length === 0,
    missing,
    openQuestions,
    prompts: PROMPTS,
  };
}

export interface FinalizeOpts {
  short?: string;
  full?: string;
  force?: boolean;
  nextStatus?: string;
}

/** Turn a completed plan into the task's spec, then move it out of planning. */
export function finalizePlan(store: Store, task: Task, opts: FinalizeOpts = {}): PlanCheck {
  const check = checkPlan(store, task);
  if (!check.ok && !opts.force) return check;

  const src = readPlan(task);
  const full = opts.full?.trim() || composeSpec(store, task, src);
  const short = opts.short?.trim() || composeShort(src);
  const crit = extractCriteria(src);

  updateSpec(store, task, {
    full,
    short,
    criteria: crit.length ? crit : undefined,
    reason: 'planning finished — spec derived from plan.md',
  });

  task.meta.status = opts.nextStatus ?? 'todo';
  task.body = appendToSection(
    task.body,
    SEC_LOG,
    [
      `### plan finalized · ${shortStamp()} · @${store.user}`,
      '',
      `Plan complete${check.ok ? '' : ' (forced)'}. Status → ${task.meta.status}.`,
      '',
      '- plan: `context/plan.md`',
    ].join('\n'),
  );
  touch(task, store.user);
  saveTask(task);
  return { ...check, ok: true };
}

function stripAsks(text: string): string {
  return text
    .split('\n')
    .filter((l) => !/^<!--\s*ask:/.test(l.trim()))
    .join('\n')
    .trim();
}

function composeSpec(store: Store, task: Task, plan: string): string {
  const out: string[] = [`# ${task.meta.title}`, ''];
  for (const name of store.config.planSections) {
    if (name === 'Open Questions') continue;
    const body = stripAsks(getSection(plan, name) ?? '');
    if (!body) continue;
    out.push(`## ${name}`, '', body, '');
  }
  const oq = stripAsks(getSection(plan, 'Open Questions') ?? '');
  if (oq && !/^_?\s*none/i.test(oq)) out.push('## Open Questions', '', oq, '');
  const qa = stripAsks(getSection(plan, 'Q&A') ?? '');
  if (qa && !/^_none yet_$/.test(qa)) out.push('## Decisions (from planning Q&A)', '', qa, '');
  return out.join('\n').trim();
}

function composeShort(plan: string): string {
  const goal = stripAsks(getSection(plan, 'Goal') ?? '');
  const problem = stripAsks(getSection(plan, 'Problem') ?? '');
  const base = (goal || problem).split('\n').slice(0, 6).join('\n').trim();
  const scope = stripAsks(getSection(plan, 'Scope') ?? '');
  const outOf = /\*\*Out:?\*\*\s*([\s\S]*)$/i.exec(scope)?.[1]?.trim();
  const lines = [base || '_see full spec_'];
  if (outOf && !isBlank(outOf)) {
    const items = outOf
      .split('\n')
      .map((l) => l.replace(/^[-*]\s*/, '').trim())
      .filter((l) => l && !TBD.test(l));
    if (items.length) lines.push('', `Out of scope: ${items.join('; ')}.`);
  }
  lines.push('', 'Full spec: `context/spec.md` · plan: `context/plan.md`');
  return lines.join('\n');
}

function extractCriteria(plan: string): string[] {
  const sec = getSection(plan, 'Success Criteria') ?? '';
  return sec
    .split('\n')
    .map((l) => /^[-*]\s*(\[[ xX]\]\s*)?(.+)$/.exec(l.trim())?.[2]?.trim() ?? '')
    .filter((l) => l && !TBD.test(l));
}

export { PROMPTS as PLAN_PROMPTS };
