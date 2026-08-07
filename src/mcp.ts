/**
 * MCP stdio server — line-delimited JSON-RPC 2.0, tools only.
 * Hand-rolled so dolly stays dependency-free; the surface mirrors the CLI.
 */
import { changedFiles } from './core/git.js';
import { archiveTask, housekeep } from './core/housekeep.js';
import {
  addPlanQA,
  checkPlan,
  finalizePlan,
  readPlan,
  setPlanSection,
  startPlan,
  PLAN_PROMPTS,
} from './core/plan.js';
import { renderBoard, renderContext, renderShow } from './core/render.js';
import { Store, currentTask } from './core/store.js';
import { addStep, createTask, fullSpec, setStatus, updateSpec } from './core/task.js';
import type { Task } from './core/types.js';
import { codeMapLine, ensureProject, projectDigest, projectStatus, setProjectSection } from './core/project.js';
import { relatedByFiles, relatedToTask, renderRelated } from './core/related.js';
import { maybeAutoMigrate, versionState } from './migrate.js';
import {
  applyReindex,
  importedTurns,
  loadTranscript,
  renderDigest,
  selectSegments,
  type ReindexOpts,
} from './reindex.js';

const PROTOCOL = '2025-06-18';
const SERVER = { name: 'dolly', version: '0.1.0' };

type Json = Record<string, any>;

interface Tool {
  name: string;
  description: string;
  inputSchema: Json;
  run(a: Json): string;
}

const S = (description: string) => ({ type: 'string', description });
const SArr = (description: string) => ({
  type: 'array',
  items: { type: 'string' },
  description,
});
const REF = S('Task ref: id (3 or 0003), slug, unique substring, or "current".');

function store(): Store {
  return Store.open();
}

function open(ref: string, includeArchived = true): { s: Store; t: Task } {
  const s = store();
  if (!s.exists) throw new Error('dolly not initialized here — run `dolly init` in the project');
  return { s, t: s.resolve(ref, includeArchived) };
}

function writable(): Store {
  const s = store();
  s.init();
  return s;
}

const TOOLS: Tool[] = [
  {
    name: 'dolly_board',
    description:
      'Task board grouped by status (todo/planning/working/validating/done). Read this first to see what work exists and which task is active.',
    inputSchema: {
      type: 'object',
      properties: {
        status: S('Only this status.'),
        includeArchived: { type: 'boolean', description: 'Include archived tasks.' },
      },
    },
    run(a) {
      const s = store();
      if (!s.exists) return `dolly not initialized. Run \`dolly init\` (store would be ${s.root}).`;
      let tasks = s.loadTasks(Boolean(a.includeArchived));
      if (a.status) tasks = tasks.filter((t) => t.meta.status === a.status);
      const active = currentTask(tasks, s.config);
      const board = renderBoard(s, tasks, { showArchived: Boolean(a.includeArchived) });
      return `${board}\n\nactive task: ${active ? `${active.meta.id} ${active.meta.slug}` : 'none'}`;
    },
  },
  {
    name: 'dolly_context',
    description:
      "Full rehydrate payload for a task: spec (short + full), success criteria, whole step log, and the last N steps' full context. Call before editing code on an existing task.",
    inputSchema: {
      type: 'object',
      properties: {
        ref: REF,
        steps: { type: 'number', description: 'How many recent steps to include in full. Default 3, 0 = all.' },
      },
    },
    run(a) {
      const { s, t } = open(a.ref ?? 'current');
      // the store is what adds the project brief, related tasks and file list —
      // omitting it made the recommended integration the impoverished one
      return renderContext(t, { steps: a.steps ?? 3, store: s });
    },
  },
  {
    name: 'dolly_task_show',
    description: 'One task: metadata, short spec, criteria, step log. Add full=true for the full spec and plan.',
    inputSchema: {
      type: 'object',
      properties: { ref: REF, full: { type: 'boolean' } },
      required: ['ref'],
    },
    run(a) {
      const { t } = open(a.ref);
      const base = renderShow(t, { full: false });
      if (!a.full) return base;
      return `${base}\n\n--- full spec ---\n${fullSpec(t)}\n\n--- plan ---\n${readPlan(t) || '(none)'}`;
    },
  },
  {
    name: 'dolly_task_new',
    description:
      'Create a task without planning. Use for small, well-understood work. For a feature that needs an interview, use dolly_plan_start.',
    inputSchema: {
      type: 'object',
      properties: {
        title: S('Short imperative title.'),
        specShort: S('2-5 line spec for the shared updates file.'),
        specFull: S('Full spec markdown, stored as context/spec.md.'),
        status: S('Initial status. Default todo.'),
        tags: SArr('Tags.'),
        criteria: SArr('Success criteria, one per item.'),
      },
      required: ['title'],
    },
    run(a) {
      const s = writable();
      const t = createTask(s, {
        title: a.title,
        status: a.status,
        tags: a.tags,
        specShort: a.specShort,
        specFull: a.specFull,
        criteria: a.criteria,
      });
      return `created ${t.meta.id} "${t.meta.title}" status ${t.meta.status}\ndir ${t.dir}`;
    },
  },
  {
    name: 'dolly_step_add',
    description:
      'Append a major step to the task log. summary becomes one line in task.md; detail is appended to context/steps.md and should read like a handoff note to an agent with zero context (decisions, dead ends, snippets, next hints). Call after every meaningful slice of work.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: REF,
        summary: S('1-3 lines: what changed and why.'),
        detail: S('Long-form context appended to context/steps.md.'),
        files: SArr('Changed file paths.'),
        autoFiles: { type: 'boolean', description: 'Also read changed files from git.' },
        status: S('Optionally move the task to this status.'),
      },
      required: ['summary'],
    },
    run(a) {
      const { s, t } = open(a.ref ?? 'current', false);
      let files: string[] = Array.isArray(a.files) ? a.files : [];
      if (a.autoFiles) {
        files = [
          ...new Set([...files, ...changedFiles(s.project).filter((f) => !f.startsWith('.dolly/'))]),
        ];
      }
      const n = addStep(s, t, {
        summary: a.summary,
        files,
        detail: a.detail,
        status: a.status,
      });
      return `step ${String(n).padStart(4, '0')} logged on ${t.meta.id} (${files.length} file(s)${a.detail ? ', full context saved' : ', no full context'})`;
    },
  },
  {
    name: 'dolly_spec_update',
    description:
      'Change a task spec. Passing full bumps the spec version and moves the old spec into the "Superseded versions" section at the bottom of the same context/spec.md; short replaces only the summary in task.md. Always pass reason.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: REF,
        short: S('New 2-5 line summary for the shared file.'),
        full: S('New full spec markdown. Bumps version, old version kept in the same file.'),
        criteria: SArr('Replacement success criteria.'),
        reason: S('Why the spec changed.'),
      },
      required: ['ref'],
    },
    run(a) {
      const { s, t } = open(a.ref, false);
      const v = updateSpec(s, t, {
        short: a.short,
        full: a.full,
        criteria: a.criteria,
        reason: a.reason,
      });
      return `spec of ${t.meta.id} now v${v}`;
    },
  },
  {
    name: 'dolly_status_set',
    description:
      'Move a task: todo -> planning -> working -> validating -> done. validating means the agent finished and a human must verify; never set done yourself.',
    inputSchema: {
      type: 'object',
      properties: { ref: REF, status: S('Target status.'), note: S('Why / what to check.') },
      required: ['ref', 'status'],
    },
    run(a) {
      const { s, t } = open(a.ref, false);
      const from = t.meta.status;
      setStatus(s, t, a.status, a.note);
      const tail =
        a.status === s.config.reviewStatus ? ' — human review needed, stop work here' : '';
      return `${t.meta.id} ${from} -> ${t.meta.status}${tail}`;
    },
  },
  {
    name: 'dolly_plan_start',
    description:
      'Begin planning a feature. Creates a task in status planning with an interview scaffold. Next: dolly_plan_check to get the agenda, ask the user, then dolly_plan_set / dolly_plan_qa.',
    inputSchema: {
      type: 'object',
      properties: { title: S('Feature title.'), brief: S("The user's own description, verbatim.") },
      required: ['title'],
    },
    run(a) {
      const s = writable();
      const t = startPlan(s, a.title, a.brief ?? '');
      const agenda = s.config.planSections
        .map((n) => `- ${n}: ${PLAN_PROMPTS[n] ?? ''}`)
        .join('\n');
      return `created ${t.meta.id} "${t.meta.title}" status planning\nplan: ${t.dir}/context/plan.md\n\nInterview agenda — ask the user about each, do not invent answers:\n${agenda}`;
    },
  },
  {
    name: 'dolly_plan_set',
    description:
      'Fill one plan section. Sections: Problem, Goal, Scope, Success Criteria, Changes, Risks, Test Plan, Open Questions.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: REF,
        section: S('Section name, e.g. "Success Criteria".'),
        text: S('Markdown body for the section.'),
      },
      required: ['ref', 'section', 'text'],
    },
    run(a) {
      const { s, t } = open(a.ref, false);
      setPlanSection(s, t, a.section, a.text);
      const c = checkPlan(s, t);
      return `plan ${t.meta.id} "${a.section}" updated.\n${describeCheck(c)}`;
    },
  },
  {
    name: 'dolly_plan_qa',
    description: 'Record one question you asked the user and their answer, into the plan Q&A log.',
    inputSchema: {
      type: 'object',
      properties: { ref: REF, question: S('Question asked.'), answer: S("User's answer.") },
      required: ['ref', 'question', 'answer'],
    },
    run(a) {
      const { s, t } = open(a.ref, false);
      addPlanQA(s, t, a.question, a.answer);
      return `Q&A recorded on ${t.meta.id}`;
    },
  },
  {
    name: 'dolly_plan_check',
    description:
      'Gate check: which plan sections are still empty and which open questions are unanswered. Use the output as your interview agenda.',
    inputSchema: { type: 'object', properties: { ref: REF }, required: [] },
    run(a) {
      const { s, t } = open(a.ref ?? 'current');
      return describeCheck(checkPlan(s, t));
    },
  },
  {
    name: 'dolly_plan_finalize',
    description:
      'Turn a complete plan into the task spec and move the task to todo. Blocked while dolly_plan_check reports gaps unless force=true.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: REF,
        force: { type: 'boolean', description: 'Finalize despite gaps.' },
        short: S('Override the derived short spec.'),
        full: S('Override the derived full spec.'),
        status: S('Status after finalize. Default todo.'),
      },
      required: ['ref'],
    },
    run(a) {
      const { s, t } = open(a.ref, false);
      const c = finalizePlan(s, t, {
        force: Boolean(a.force),
        short: a.short,
        full: a.full,
        nextStatus: a.status,
      });
      if (!c.ok) return `finalize blocked.\n${describeCheck(c)}\n\nAnswer these with the user, or pass force=true.`;
      return `plan ${t.meta.id} finalized · spec v${t.meta.spec_version} · status ${t.meta.status}`;
    },
  },
  {
    name: 'dolly_archive',
    description: 'Move a task to archive/YYYY-MM immediately, regardless of age.',
    inputSchema: {
      type: 'object',
      properties: { ref: REF, note: S('Why.') },
      required: ['ref'],
    },
    run(a) {
      const { s, t } = open(a.ref, false);
      const moved = archiveTask(s, t, a.note);
      return `${moved.meta.id} archived -> ${moved.rel}`;
    },
  },
  {
    name: 'dolly_project',
    description:
      "Repo-level knowledge: what is true about this codebase, independent of any task — Overview, Architecture, Conventions, Invariants, Glossary. READ THIS before planning or deciding anything on an unfamiliar task; a task here is a slice of an ongoing codebase, not a greenfield project. It is not a second CLAUDE.md: CLAUDE.md says how to behave, this records what is true about the code. Maintain it — pass section+text to write what you learn. Rule of thumb: a fact useful to a task that does not exist yet belongs here; a fact about what this task did belongs in a step.",
    inputSchema: {
      type: 'object',
      properties: {
        section: S('Section to write: Overview, Architecture, Conventions, Invariants, Glossary.'),
        text: S('Markdown body for that section. Omit both to read the brief.'),
      },
    },
    run(a) {
      const s = store();
      if (!s.exists) return 'dolly not initialized here.';
      if (a.section && a.text) {
        ensureProject(s);
        setProjectSection(s, a.section, a.text);
        const st = projectStatus(s);
        return `project brief "${a.section}" updated.${st.missing.length ? ` Still unfilled: ${st.missing.join(', ')}.` : ''}`;
      }
      const st = projectStatus(s);
      const maps = codeMapLine(s.project);
      const digest = projectDigest(s);
      const out: string[] = [];
      out.push(digest || 'The project brief is empty. Fill it as you learn about this repo.');
      if (st.missing.length) {
        out.push('', `unfilled sections: ${st.missing.map((m) => `${m} (${st.prompts[m]})`).join(' · ')}`);
      }
      if (maps) out.push('', `code map available — use it before grepping:\n${maps}`);
      return out.join('\n');
    },
  },
  {
    name: 'dolly_related',
    description:
      'Which other tasks have touched this code, and what they concluded. dolly records the files every step touched, so this is a link nothing else in the toolchain can give you. Call it before changing shared code or opening a task adjacent to existing work — the outcome lines will tell you if you are about to undo a deliberate decision. Pass files to check code you are about to edit, or ref for an existing task.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: REF,
        files: SArr('Repo-relative paths you are about to touch. Takes precedence over ref.'),
      },
    },
    run(a) {
      const s = store();
      if (!s.exists) return 'dolly not initialized here.';
      const files: string[] = Array.isArray(a.files) ? a.files : [];
      const related = files.length
        ? relatedByFiles(s, files)
        : relatedToTask(s, s.resolve(a.ref ?? 'current'));
      const subject = files.length ? `${files.length} file(s)` : (a.ref ?? 'current');
      if (!related.length) return `No other task has touched this code (${subject}).`;
      return `Tasks sharing code with ${subject}:\n\n${renderRelated(related, 20)}`;
    },
  },
  {
    name: 'dolly_reindex',
    description:
      "Attach dolly to a conversation that is already in flight. Reads this project's Claude Code transcript and returns a digest: every human request verbatim, the files touched and commands run per turn, with timestamps. Call with apply=false first and read the digest; then apply=true to import it as a task with one step per turn. Safe to re-run — turns already imported are skipped. Use rebuild=true to re-import a session after dolly's storage format changes. After importing, replace the mechanical spec with a real one via dolly_spec_update: you have the conversation in context, the transcript does not know what matters.",
    inputSchema: {
      type: 'object',
      properties: {
        apply: { type: 'boolean', description: 'Import it. Omit or false to only read the digest.' },
        into: S('Import into this existing task ref instead of creating one.'),
        session: S('Session id or prefix. Default: the most recently written session for this project, i.e. the live one.'),
        file: S('Explicit path to a .jsonl transcript.'),
        allTurns: {
          type: 'boolean',
          description: 'Keep every turn as its own step. By default a turn that ran no tools folds into the work that followed it.',
        },
        limit: { type: 'number', description: 'Only the last N segments.' },
        rebuild: { type: 'boolean', description: 'Drop steps already imported from this session, then import again.' },
        title: S('Override the task title (default: the session title from Claude Code).'),
        status: S('Task status after import. Default working.'),
      },
    },
    run(a) {
      const s = store();
      const opts: ReindexOpts = {
        session: a.session,
        file: a.file,
        allTurns: Boolean(a.allTurns),
        limit: a.limit,
        into: a.into,
        title: a.title,
        status: a.status,
        rebuild: Boolean(a.rebuild),
      };
      const transcript = loadTranscript(s.project, opts);
      const segments = selectSegments(transcript, opts);

      if (!a.apply) {
        let target: Task | null = null;
        if (s.exists) {
          try {
            target = s.resolve(opts.into ?? 'current', false);
          } catch {
            target = null;
          }
        }
        return renderDigest(transcript, segments, target ? importedTurns(target) : new Set(), target);
      }
      s.init();
      const res = applyReindex(s, transcript, opts);
      return [
        `${res.created ? 'created' : 'updated'} ${res.task.meta.id} "${res.task.meta.title}" (${res.task.meta.status})`,
        `imported ${res.imported} step(s) from session ${transcript.sessionId.slice(0, 8)}${res.skipped ? `, skipped ${res.skipped} already present` : ''}${res.rebuilt ? `, dropped ${res.rebuilt} for rebuild` : ''}`,
        '',
        'The spec is a mechanical import of the raw requests. Replace it now with dolly_spec_update — write the spec from your own understanding of the conversation, and set reason to "reindexed from session ' +
          transcript.sessionId.slice(0, 8) +
          '".',
      ].join('\n');
    },
  },
  {
    name: 'dolly_housekeep',
    description:
      'Age out finished work: archive old done tasks, flag stale ones, prune old full step context. dryRun=true to preview.',
    inputSchema: { type: 'object', properties: { dryRun: { type: 'boolean' } } },
    run(a) {
      const s = store();
      if (!s.exists) return 'dolly not initialized here.';
      const r = housekeep(s, { dryRun: Boolean(a.dryRun) });
      if (!r.actions.length) return `housekeeping${r.dryRun ? ' (dry run)' : ''}: nothing to do`;
      return [
        `housekeeping${r.dryRun ? ' (dry run)' : ''}: ${r.actions.length} action(s)`,
        ...r.actions.map((x) => `- ${x.kind} · ${x.task} · ${x.detail}`),
      ].join('\n');
    },
  },
];

function describeCheck(c: ReturnType<typeof checkPlan>): string {
  if (c.ok) return 'plan complete — ready for dolly_plan_finalize';
  const out: string[] = [];
  if (c.missing.length) {
    out.push('unfilled sections:');
    for (const m of c.missing) out.push(`- ${m}: ${c.prompts[m] ?? ''}`);
  }
  if (c.openQuestions.length) {
    out.push('open questions (ask the user):');
    for (const q of c.openQuestions) out.push(`- ${q}`);
  }
  return out.join('\n');
}

const WRITE_TOOLS = new Set([
  'dolly_task_new', 'dolly_step_add', 'dolly_spec_update', 'dolly_status_set',
  'dolly_plan_start', 'dolly_plan_set', 'dolly_plan_qa', 'dolly_plan_finalize',
  'dolly_project', 'dolly_archive', 'dolly_housekeep', 'dolly_reindex',
]);

/**
 * Same rule as the CLI: a store written by a newer dolly refuses writes, and
 * lossless migrations are applied without being asked.
 */
function guardVersion(tool: string): string | null {
  const s = store();
  if (!s.exists) return null;
  const state = versionState(s);
  if (state.newer && WRITE_TOOLS.has(tool)) {
    return `error: this store is at schema version ${state.store} but this dolly understands ${state.code}. It was written by a newer dolly — upgrade dolly before writing to it.`;
  }
  if (!state.newer) maybeAutoMigrate(s);
  const risky = versionState(store()).unsafePending;
  if (risky.length && WRITE_TOOLS.has(tool)) {
    return `error: ${risky.length} migration(s) must be applied first — run \`dolly migrate\` in a terminal: ${risky.map((r) => r.migration.name).join('; ')}`;
  }
  return null;
}

/* ------------------------------ JSON-RPC loop ----------------------------- */

function send(msg: Json): void {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

function result(id: unknown, value: Json): void {
  send({ jsonrpc: '2.0', id, result: value });
}

function error(id: unknown, code: number, message: string): void {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

function handle(msg: Json): void {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case 'initialize': {
      const requested = typeof params?.protocolVersion === 'string' ? params.protocolVersion : PROTOCOL;
      return result(id, {
        protocolVersion: requested,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions:
          'dolly keeps task memory in .dolly/. Call dolly_board then dolly_context before coding. Log every major step with dolly_step_add. Plan features via dolly_plan_start -> dolly_plan_check -> ask user -> dolly_plan_set -> dolly_plan_finalize.',
      });
    }
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return;
    case 'ping':
      return result(id, {});
    case 'tools/list':
      return result(id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });
    case 'tools/call': {
      const name = params?.name;
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return error(id, -32602, `unknown tool: ${name}`);
      const guard = guardVersion(name);
      if (guard) return result(id, { content: [{ type: 'text', text: guard }], isError: true });
      try {
        const text = tool.run(params?.arguments ?? {});
        return result(id, { content: [{ type: 'text', text }] });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return result(id, { content: [{ type: 'text', text: `error: ${message}` }], isError: true });
      }
    }
    case 'resources/list':
      return result(id, { resources: [] });
    case 'prompts/list':
      return result(id, { prompts: [] });
    default:
      if (isNotification) return;
      return error(id, -32601, `method not found: ${method}`);
  }
}

export function runMcpServer(): Promise<void> {
  return new Promise((resolve) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      buf += chunk;
      let nl: number;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg: Json;
        try {
          msg = JSON.parse(line);
        } catch {
          send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } });
          continue;
        }
        try {
          handle(msg);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (msg.id !== undefined) error(msg.id, -32603, message);
        }
      }
    });
    process.stdin.on('end', () => resolve());
    process.stdin.resume();
  });
}
