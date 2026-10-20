/**
 * `dolly review`: one pass, by a human, over the work agents handed over.
 *
 * Agents may move a task to the review status but never past it, so closing
 * one is the human's job — and it used to mean reading task.md, hand-editing
 * checkboxes, then typing `dolly status <ref> done`. It rarely happened, and
 * finished work kept being presented as open. This walks the queue instead.
 *
 * Two rules:
 *  - never runs without a human (the caller checks core/tty.ts first);
 *  - the store lock is taken per action and the task re-read under it, never
 *    held while a person thinks — a turn-end hook in another session must not
 *    wait on someone's coffee break.
 */
import { withStoreLock } from './core/lock.js';
import { filesOfTask } from './core/related.js';
import { color } from './core/render.js';
import { Store } from './core/store.js';
import { criteriaList, handoffNote, setCriterion, setStatus, shortSpec } from './core/task.js';
import { humanAge } from './core/time.js';
import type { Task } from './core/types.js';
import { confirm, multiselect, note, select, text, type Term } from './prompt.js';

export interface ReviewOpts {
  term: Term;
  /** opens the store fresh — every action re-reads under the lock */
  open: () => Store;
  /** one task instead of the whole queue */
  only?: string;
  /** default: the configured review status */
  status?: string;
  /** where "send back" moves a task; default `working`, else the first status */
  backTo?: string;
}

export interface ReviewResult {
  done: string[];
  back: string[];
  skipped: string[];
  ticked: number;
}

type Action = 'done' | 'tick' | 'back' | 'skip' | 'quit';

function clipLines(s: string, max: number): string {
  const lines = s.trim().split('\n');
  return lines.length > max ? `${lines.slice(0, max).join('\n')}\n${color.dim(`… ${lines.length - max} more line(s)`)}` : lines.join('\n');
}

function screen(term: Term, task: Task, n: number, of: number, status: string): void {
  const m = task.meta;
  term.write(`\n${color.bold(`── ${n}/${of} · ${m.id} ${m.title}`)}\n`);
  note(term, `${m.status} · @${m.owner} · ${m.steps} step(s) · updated ${humanAge(m.updated)}`);
  const spec = shortSpec(task).trim();
  if (spec) term.write(`\n${clipLines(spec, 6)}\n`);
  const handoff = handoffNote(task, status);
  if (handoff) term.write(`\n${color.bold('Agent says to check:')} ${clipLines(handoff, 6)}\n`);
  const files = filesOfTask(task);
  if (files.length) {
    term.write(`\n${color.dim(`files: ${files.slice(0, 8).join(', ')}${files.length > 8 ? ` +${files.length - 8} more` : ''}`)}\n`);
  }
  const crit = criteriaList(task);
  term.write(`\n${color.bold('Criteria')}\n`);
  if (!crit.length) note(term, '  none recorded');
  for (const c of crit) term.write(`  ${c.index}) [${c.checked ? 'x' : ' '}] ${c.text}\n`);
  term.write('\n');
}

export async function runReview(opts: ReviewOpts): Promise<ReviewResult> {
  const { term } = opts;
  const first = opts.open();
  const status = opts.status ?? first.config.reviewStatus;
  const done = first.config.doneStatus;
  const backTo = opts.backTo ?? (first.config.statuses.includes('working') ? 'working' : first.config.statuses[0]);
  const queue = opts.only
    ? [first.resolve(opts.only)]
    : first
        .loadTasks()
        .filter((t) => t.meta.status === status)
        // oldest hand-over first: it has waited longest
        .sort((a, b) => a.meta.updated.localeCompare(b.meta.updated));
  const result: ReviewResult = { done: [], back: [], skipped: [], ticked: 0 };
  if (!queue.length) {
    note(term, `nothing in ${status} — the review queue is empty`);
    return result;
  }

  /** run one write under the lock, on a fresh copy of the task */
  const write = <T>(id: string, fn: (s: Store, t: Task) => T): T => {
    const root = opts.open().root;
    return withStoreLock(root, 'review', () => {
      const s = opts.open();
      return fn(s, s.resolve(id));
    });
  };

  let i = 0;
  for (const queued of queue) {
    i++;
    const id = queued.meta.id;
    for (;;) {
      const task = opts.open().resolve(id);
      screen(term, task, i, queue.length, status);
      const crit = criteriaList(task);
      const action = await select<Action>(term, {
        question: 'What now?',
        choices: [
          { value: 'done', label: `Done — move to ${done}` },
          ...(crit.length ? [{ value: 'tick' as const, label: 'Tick criteria…', hint: `${crit.filter((c) => c.checked).length}/${crit.length} checked` }] : []),
          { value: 'back', label: `Back to ${backTo} — with a note for the agent` },
          { value: 'skip', label: 'Skip for now' },
          { value: 'quit', label: 'Quit' },
        ],
      });
      if (action === 'quit') return result;
      if (action === 'skip') {
        result.skipped.push(id);
        break;
      }
      if (action === 'tick') {
        const picked = await multiselect(term, {
          question: 'Which criteria hold?',
          choices: crit.map((c) => ({ value: c.index, label: c.text })),
          checked: crit.filter((c) => c.checked).map((c) => c.index),
        });
        result.ticked += write(id, (s, t) => {
          let changed = 0;
          for (const c of criteriaList(t)) if (setCriterion(s, t, c.index, picked.includes(c.index))) changed++;
          return changed;
        });
        continue;
      }
      if (action === 'back') {
        const why = await text(term, {
          question: 'What is missing or wrong? (the agent reads this)',
          validate: (v) => (v.trim() ? null : 'a note is required — it is the only thing the agent gets'),
        });
        write(id, (s, t) => setStatus(s, t, backTo, why));
        result.back.push(id);
        break;
      }
      const open = crit.filter((c) => !c.checked).length;
      if (open && !(await confirm(term, { question: `${open} criteria unchecked — mark done anyway?`, value: false }))) continue;
      write(id, (s, t) => setStatus(s, t, done));
      result.done.push(id);
      break;
    }
  }
  return result;
}

/** the store a review runs against: the one the CLI resolved, opened fresh */
export function storeOpener(cwd = process.cwd()): () => Store {
  return () => Store.open(cwd);
}
