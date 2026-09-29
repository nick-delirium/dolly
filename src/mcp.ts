/**
 * MCP stdio server — line-delimited JSON-RPC 2.0, tools only.
 * Hand-rolled so dolly stays dependency-free; the surface mirrors the CLI.
 */
import { changedFiles } from './core/git.js';
import { withStoreLock } from './core/lock.js';
import { VERSION } from './core/pkg.js';
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
import { legacyOrphan, maybeAutoMigrate, versionState } from './migrate.js';
import {
  applyReindex,
  importedTurns,
  loadTranscript,
  renderDigest,
  selectSegments,
  type ReindexOpts,
} from './reindex.js';

const PROTOCOL = '2025-06-18';
/** versions this server speaks; anything else is answered with PROTOCOL */
const SUPPORTED = new Set(['2024-11-05', '2025-03-26', '2025-06-18']);
const SERVER = { name: 'dolly', version: VERSION };

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
const REF = S('Task ref: 8-char id, slug, unique substring, fuzzy title, or "current" (the default).');

function store(): Store {
  return Store.open();
}

function open(ref: string): { s: Store; t: Task } {
  const s = store();
  if (!s.exists) throw new Error('dolly not initialized here — run `dolly init` in the project');
  return { s, t: s.resolve(ref) };
}

function writable(): Store {
  const s = store();
  s.init();
  return s;
}

/**
 * The task-memory core of the CLI. Deliberately absent: `setup`/`init` (an
 * interactive screen — a prompt on a JSON-RPC stream hangs the client),
 * `continue` (spawns a TUI), and the maintenance commands (`retitle`, `memo`,
 * `config`, `whoami`, `migrate`, `install`, `update`) — an agent with a shell
 * runs those through the CLI.
 */
const TOOLS: Tool[] = [
  {
    name: 'dolly_board',
    description: 'Task board by status, and which task is active.',
    inputSchema: {
      type: 'object',
      properties: {
        status: S('Only this status.'),
        mine: { type: 'boolean', description: 'Only tasks you own.' },
        tag: S('Only tasks with this tag.'),
      },
    },
    run(a) {
      const s = store();
      if (!s.exists) return `dolly not initialized. Run \`dolly init\` (store would be ${s.root}).`;
      let tasks = s.loadTasks();
      if (a.status) tasks = tasks.filter((t) => t.meta.status === a.status);
      if (a.mine) tasks = tasks.filter((t) => t.meta.owner === s.user);
      if (a.tag) tasks = tasks.filter((t) => t.meta.tags.includes(a.tag));
      const active = currentTask(tasks, s.config);
      const board = renderBoard(s, tasks);
      return `${board}\n\nactive task: ${active ? `${active.meta.id} ${active.meta.slug}` : 'none'}`;
    },
  },
  {
    name: 'dolly_context',
    description: "Rehydrate a task before editing its code: spec, criteria, log, recent steps' full context, project brief, related tasks.",
    inputSchema: {
      type: 'object',
      properties: {
        ref: REF,
        steps: { type: 'number', description: 'Recent steps in full. Default 3, 0 = all.' },
        brief: { type: 'boolean', description: 'No step bodies.' },
      },
    },
    run(a) {
      const { s, t } = open(a.ref ?? 'current');
      // the store is what adds the project brief, related tasks and file list —
      // omitting it made the recommended integration the impoverished one
      return renderContext(t, { steps: a.steps ?? 3, brief: Boolean(a.brief), store: s });
    },
  },
  {
    name: 'dolly_task_show',
    description: 'One task: metadata, short spec, criteria, log. full=true adds full spec and plan.',
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
    description: 'Create a task for small, understood work. A feature that needs an interview: dolly_plan_start.',
    inputSchema: {
      type: 'object',
      properties: {
        title: S('Imperative title.'),
        specShort: S('2-5 line spec.'),
        specFull: S('Full spec markdown.'),
        status: S('Default todo.'),
        tags: SArr('Tags.'),
        criteria: SArr('One criterion per item.'),
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
    description: 'Log a major step. summary = the outcome (one line in task.md); detail = handoff note for an agent with zero context (context/steps.md).',
    inputSchema: {
      type: 'object',
      properties: {
        ref: REF,
        summary: S('The outcome, 1-3 lines.'),
        detail: S('Handoff note: decisions, dead ends, next.'),
        files: SArr('Changed files.'),
        autoFiles: { type: 'boolean', description: 'Add changed files from git.' },
        status: S('Also move the task here.'),
      },
      required: ['summary'],
    },
    run(a) {
      const { s, t } = open(a.ref ?? 'current');
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
    description: "Change a spec. full bumps the version and keeps the old one in context/spec.md; short/criteria replace task.md's. Pass reason.",
    inputSchema: {
      type: 'object',
      properties: {
        ref: REF,
        short: S('New 2-5 line summary.'),
        full: S('New full spec; bumps the version.'),
        criteria: SArr('Replacement criteria.'),
        reason: S('Why it changed.'),
      },
      required: ['ref'],
    },
    run(a) {
      const { s, t } = open(a.ref);
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
    description: 'Move a task: todo → planning → working → validating → done. Finished = validating; never set done.',
    inputSchema: {
      type: 'object',
      properties: { ref: REF, status: S('Target status.'), note: S('Why / what to check.') },
      required: ['ref', 'status'],
    },
    run(a) {
      const { s, t } = open(a.ref);
      const from = t.meta.status;
      setStatus(s, t, a.status, a.note);
      const tail =
        a.status === s.config.reviewStatus ? ' — human review needed, stop work here' : '';
      return `${t.meta.id} ${from} -> ${t.meta.status}${tail}`;
    },
  },
  {
    name: 'dolly_plan_start',
    description: 'Start planning a feature (status planning). Then dolly_plan_check, ask the user, dolly_plan_set / dolly_plan_qa.',
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
    description: 'Fill one plan section: Problem, Goal, Scope, Success Criteria, Changes, Risks, Test Plan, Open Questions.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: REF,
        section: S('e.g. "Success Criteria".'),
        text: S('Markdown body.'),
      },
      required: ['ref', 'section', 'text'],
    },
    run(a) {
      const { s, t } = open(a.ref);
      setPlanSection(s, t, a.section, a.text);
      const c = checkPlan(s, t);
      return `plan ${t.meta.id} "${a.section}" updated.\n${describeCheck(c)}`;
    },
  },
  {
    name: 'dolly_plan_qa',
    description: 'Record a question you asked the user and their answer.',
    inputSchema: {
      type: 'object',
      properties: { ref: REF, question: S('Question asked.'), answer: S("User's answer.") },
      required: ['ref', 'question', 'answer'],
    },
    run(a) {
      const { s, t } = open(a.ref);
      addPlanQA(s, t, a.question, a.answer);
      return `Q&A recorded on ${t.meta.id}`;
    },
  },
  {
    name: 'dolly_plan_check',
    description: 'Which plan sections are empty and which questions are open — the interview agenda.',
    inputSchema: { type: 'object', properties: { ref: REF }, required: [] },
    run(a) {
      const { s, t } = open(a.ref ?? 'current');
      return describeCheck(checkPlan(s, t));
    },
  },
  {
    name: 'dolly_plan_finalize',
    description: 'Turn a complete plan into the spec; status → todo. Blocked while gaps remain unless force=true.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: REF,
        force: { type: 'boolean' },
        short: S('Override the derived short spec.'),
        full: S('Override the derived full spec.'),
        status: S('Default todo.'),
      },
      required: ['ref'],
    },
    run(a) {
      const { s, t } = open(a.ref);
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
    name: 'dolly_project',
    description: 'Repo-level brief: what is true about this codebase. Read before deciding anything; pass section+text to record a durable fact.',
    inputSchema: {
      type: 'object',
      properties: {
        section: S('Overview, Architecture, Conventions, Invariants or Glossary.'),
        text: S('Markdown body. Omit both to read.'),
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
    description: "Tasks that touched these files (or this task's files), and what they concluded. Call before changing shared code.",
    inputSchema: {
      type: 'object',
      properties: {
        ref: REF,
        files: SArr('Paths you are about to touch; wins over ref.'),
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
    description: 'Adopt a conversation already in flight: apply=false returns a digest of its transcript, apply=true imports it one step per turn (idempotent). Then replace the imported spec.',
    inputSchema: {
      type: 'object',
      properties: {
        apply: { type: 'boolean', description: 'Import; false = digest only.' },
        into: S('Existing task to import into.'),
        session: S('Session id/prefix. Default: the live one.'),
        file: S('Path to a .jsonl transcript.'),
        allTurns: { type: 'boolean', description: 'One step per turn; by default tool-less turns fold forward.' },
        limit: { type: 'number', description: 'Last N turns only.' },
        rebuild: { type: 'boolean', description: 'Re-import this session.' },
        title: S('Task title.'),
        status: S('Default working.'),
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
        includeThinking: s.config.reindex.includeThinking,
      };
      const transcript = loadTranscript(s.project, opts);
      const segments = selectSegments(transcript, opts);

      if (!a.apply) {
        let target: Task | null = null;
        if (s.exists) {
          try {
            target = s.resolve(opts.into ?? 'current');
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

/** does this call write? Per call, like the CLI: reading the brief is not writing it */
function writesStore(tool: string, a: Json): boolean {
  switch (tool) {
    case 'dolly_project':
      return Boolean(a.section && a.text);
    case 'dolly_reindex':
      return Boolean(a.apply);
    case 'dolly_task_new': case 'dolly_step_add': case 'dolly_spec_update': case 'dolly_status_set':
    case 'dolly_plan_start': case 'dolly_plan_set': case 'dolly_plan_qa': case 'dolly_plan_finalize':
      return true;
    default:
      return false;
  }
}

/**
 * Same rule as the CLI: a store written by a newer dolly refuses writes,
 * lossless migrations apply without being asked, and risky ones only warn.
 * Returns an error to send instead of running, or a note to append.
 */
function guardVersion(tool: string, a: Json): { error?: string; note?: string } {
  const s = store();
  if (!s.exists) return {};
  const state = versionState(s);
  if (state.newer) {
    return writesStore(tool, a)
      ? { error: `error: this store is at schema version ${state.store} but this dolly understands ${state.code}. It was written by a newer dolly — upgrade dolly before writing to it.` }
      : {};
  }
  maybeAutoMigrate(s);
  const risky = versionState(store()).unsafePending;
  const orphan = legacyOrphan(s);
  const notes = [
    ...(risky.length ? [`${risky.length} migration(s) wait for \`dolly migrate\` in a terminal: ${risky.map((r) => r.migration.name).join('; ')}`] : []),
    ...(orphan ? [orphan] : []),
  ];
  return notes.length ? { note: `note: ${notes.join(' · ')}` } : {};
}

/**
 * Check arguments against the tool's own schema before running it: a missing
 * required field otherwise surfaced as "Cannot read properties of undefined".
 */
function badArgs(tool: Tool, a: Json): string | null {
  const props: Json = tool.inputSchema.properties ?? {};
  for (const key of tool.inputSchema.required ?? []) {
    if (a[key] === undefined || a[key] === null || a[key] === '') return `missing required argument "${key}"`;
  }
  for (const [key, value] of Object.entries(a)) {
    const want = props[key]?.type;
    if (!want || value === undefined || value === null) continue;
    const ok =
      want === 'array'
        ? Array.isArray(value) && value.every((x) => typeof x === (props[key].items?.type ?? 'string'))
        : typeof value === want;
    if (!ok) return `argument "${key}" must be ${want === 'array' ? `an array of ${props[key].items?.type ?? 'string'}s` : `a ${want}`}`;
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
  // a notification gets no reply of any kind — not a result, not an error
  if (id === undefined || id === null) return;

  switch (method) {
    case 'initialize': {
      const requested = params?.protocolVersion;
      return result(id, {
        protocolVersion: typeof requested === 'string' && SUPPORTED.has(requested) ? requested : PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions:
          'dolly keeps task memory in .dolly/. Call dolly_board then dolly_context before coding. Log every major step with dolly_step_add. Plan features via dolly_plan_start -> dolly_plan_check -> ask user -> dolly_plan_set -> dolly_plan_finalize.',
      });
    }
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
      const a: Json = params?.arguments && typeof params.arguments === 'object' ? params.arguments : {};
      const bad = badArgs(tool, a);
      if (bad) return result(id, { content: [{ type: 'text', text: `error: ${bad}` }], isError: true });
      const guard = guardVersion(name, a);
      if (guard.error) return result(id, { content: [{ type: 'text', text: guard.error }], isError: true });
      try {
        // same rule as the CLI: a write holds the store lock for the whole call
        const s = writesStore(name, a) ? store() : null;
        const text = s?.exists ? withStoreLock(s.root, name, () => tool.run(a)) : tool.run(a);
        return result(id, { content: [{ type: 'text', text: guard.note ? `${text}\n\n${guard.note}` : text }] });
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
        let msg: unknown;
        try {
          msg = JSON.parse(line);
        } catch {
          send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } });
          continue;
        }
        // valid JSON is not yet a request: `null`, a number or an array crashed
        // the server when the catch below read `.id` off it
        if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
          send({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'invalid request' } });
          continue;
        }
        const req = msg as Json;
        try {
          handle(req);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (req.id !== undefined && req.id !== null) error(req.id, -32603, message);
        }
      }
    });
    process.stdin.on('end', () => resolve());
    process.stdin.resume();
  });
}
