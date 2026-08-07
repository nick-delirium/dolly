#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { bool, list, num, parseArgs, repeated, str, type Args } from './core/args.js';
import { exists, readStdin, readTextOr, writeJson } from './core/fsx.js';
import { changedFiles } from './core/git.js';
import { archiveTask, housekeep, lastRun, maybeAuto, restoreTask } from './core/housekeep.js';
import {
  addPlanQA,
  checkPlan,
  finalizePlan,
  readPlan,
  setPlanSection,
  startPlan,
  PLAN_PROMPTS,
} from './core/plan.js';
import { color, renderBoard, renderContext, renderShow } from './core/render.js';
import { Store, currentTask, locateStore } from './core/store.js';
import {
  addStep,
  createTask,
  criteria,
  fullSpec,
  logSection,
  retitle,
  setStatus,
  shortSpec,
  updateSpec,
} from './core/task.js';
import { DEFAULT_CONFIG, type Task } from './core/types.js';
import { humanAge } from './core/time.js';
import { installTargets, TARGETS } from './install.js';
import { runMcpServer } from './mcp.js';
import { migrate } from './migrate.js';
import {
  applyReindex,
  importedTurns,
  loadTranscript,
  renderDigest,
  selectSegments,
  type ReindexOpts,
} from './reindex.js';
import { listSessions } from './core/transcript.js';
import { insideClaudeCode, resumeCommand } from './core/session.js';

const VERSION = '0.1.0';

const HELP = `dolly ${VERSION} — long-term memory + feature planning for coding agents

USAGE
  dolly <command> [args] [flags]

BOARD
  init [--agents a,b] [--local|--global] [--no-mcp]
                                              create .dolly/ and wire agents
  board | list [--all] [--status s] [--mine]  task board grouped by status
  show <ref> [--full] [--json]                one task
  context <ref|current> [-n N] [--brief]      rehydrate payload for an agent
  current                                     alias for: context current
  continue <ref> [--fork] [--print]           reopen the Claude Code conversation
                                              this task was worked in

TASKS
  new "<title>" [--short t] [--file f] [--status s] [--tag x]
  step <ref> -m "<summary>" [--files a,b | --auto-files]
             [--detail t | --detail-file f] [--status s]
  spec <ref> [--short t] [--file f|-] [--criteria c] [--reason why]
  status <ref> <status> [--note t]
  retitle <ref> "<new title>"                 renames the task and its directory
  archive <ref> [--note t] | restore <ref>

PLANNING
  plan start "<title>" [--brief t]
  plan show <ref>
  plan set <ref> "<Section>" (--text t | --file f|-)
  plan qa <ref> -q "<question>" -a "<answer>"
  plan check <ref> [--json]
  plan finalize <ref> [--file f] [--short t] [--force] [--status s]

ADOPT AN ONGOING CONVERSATION
  reindex [--list] [--session id] [--file f.jsonl] [--all-turns] [-n N]
          [--apply] [--into ref] [--title t] [--status s] [--rebuild]
          [--include-thinking] [--json]
                                              read the Claude Code transcript,
                                              print a digest, optionally import it

MAINTENANCE
  housekeep [--dry-run] [--json]
  migrate [--dry-run]                         upgrade an older .dolly/ layout
  config [get <key> | set <key> <value>]
  whoami

INTEGRATION
  install [agent...] [--local|--global] [--no-mcp] [--no-hooks] [--dry-run] [--list]
                                              scope default: install.scope in config (local)
  mcp                                         run MCP stdio server
  hook <session-start|stop>                   Claude Code hook payloads
  statusline                                  one-line status for a statusline

REFS
  <ref> = id (3 | 0003) | slug | unique substring | current | @

Every step is stamped with your GitHub handle (gh -> git email -> $USER).
Override with DOLLY_USER. Store location: DOLLY_DIR, else nearest .dolly/,
else <repo-root>/.dolly, else ~/.dolly/projects/<name>-<hash>.`;

function fail(msg: string): never {
  process.stderr.write(`dolly: ${msg}\n`);
  process.exit(1);
}

function openStore(requireInit = true): Store {
  const store = Store.open();
  if (requireInit && !store.exists) {
    fail(`no store found — run \`dolly init\` (would create ${store.root})`);
  }
  if (store.legacy) {
    process.stderr.write(
      color.yellow(
        `dolly: reading a pre-rename store at ${store.root} — run \`dolly migrate\` to move it to .dolly/ and rename its markers\n`,
      ),
    );
  }
  return store;
}

/** text from --text/--short/--detail, a --file (or `-` for stdin), or piped stdin */
function textFrom(args: Args, keys: { inline?: string; file?: string }): string | undefined {
  if (keys.inline) {
    const v = str(args, keys.inline);
    if (v !== undefined) return v;
  }
  if (keys.file) {
    const f = str(args, keys.file);
    if (f === '-') return readStdin();
    if (f) {
      if (!exists(f)) fail(`file not found: ${f}`);
      return readTextOr(f);
    }
  }
  return undefined;
}

function pipedStdin(): string | undefined {
  if (process.stdin.isTTY) return undefined;
  const v = readStdin();
  return v.trim() ? v : undefined;
}

function jsonOut(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

function taskJson(task: Task): Record<string, unknown> {
  return {
    ...task.meta,
    dir: task.dir,
    rel: task.rel,
    archived: task.archived,
    spec_short: shortSpec(task),
    criteria: criteria(task),
    log: logSection(task),
  };
}

/**
 * Where agent instructions get written. Default comes from
 * `install.scope` in config (shipped as "local"); flags win for one run.
 */
function installOpts(args: Args, store: Store) {
  const global = bool(args, 'global')
    ? true
    : bool(args, 'local')
      ? false
      : store.config.install.scope === 'global';
  const mcp = bool(args, 'no-mcp') ? false : bool(args, 'mcp') ? true : store.config.install.mcp;
  return { global, mcp, hooks: !bool(args, 'no-hooks'), dryRun: bool(args, 'dry-run') };
}

function afterWrite(store: Store): void {
  const report = maybeAuto(store);
  if (report && report.actions.length) {
    process.stderr.write(
      color.dim(`dolly housekeeping: ${report.actions.length} action(s) — \`dolly housekeep --dry-run\` for detail\n`),
    );
  }
}

/* ------------------------------- commands -------------------------------- */

function cmdInit(args: Args): void {
  const loc = locateStore();
  const store = new Store(loc);
  const fresh = !store.exists;
  store.init();
  process.stdout.write(
    `${fresh ? 'created' : 'store exists'} ${store.root} ${color.dim(`(${store.kind})`)}\n`,
  );
  process.stdout.write(`identity: @${store.user} ${color.dim(`(${store.identity.source})`)}\n`);

  if (bool(args, 'no-agents')) return;
  const ids = list(args, 'agents');
  const opts = installOpts(args, store);
  process.stdout.write(
    `agent instructions: ${color.bold(opts.global ? 'global' : 'local')} ` +
      `${color.dim(`(dolly config set install.scope ${opts.global ? 'local' : 'global'} to change)`)}\n`,
  );
  const results = installTargets(store.project, ids, opts);
  if (!results.length) {
    process.stdout.write(
      color.dim(`no agents detected — wire one with \`dolly install <${TARGETS.map((t) => t.id).join('|')}>\`\n`),
    );
    return;
  }
  for (const r of results) {
    process.stdout.write(`\n${color.bold(r.target.label)}\n`);
    for (const line of r.log) process.stdout.write(`  ${line}\n`);
  }
  process.stdout.write(
    `\n${color.dim('commit .dolly/ so teammates share the same task memory')}\n`,
  );
}

function cmdBoard(args: Args): void {
  const store = openStore();
  const all = bool(args, 'all');
  let tasks = store.loadTasks(all);
  const status = str(args, 'status');
  if (status) tasks = tasks.filter((t) => t.meta.status === status);
  if (bool(args, 'mine')) tasks = tasks.filter((t) => t.meta.owner === store.user);
  const tag = str(args, 'tag');
  if (tag) tasks = tasks.filter((t) => t.meta.tags.includes(tag));

  if (bool(args, 'json')) {
    jsonOut({
      store: store.root,
      user: store.user,
      current: currentTask(tasks, store.config)?.meta.id ?? null,
      tasks: tasks.map(taskJson),
    });
    return;
  }
  process.stdout.write(`${renderBoard(store, tasks, { showArchived: all })}\n`);
}

function cmdShow(args: Args): void {
  const store = openStore();
  const ref = args.positional[1];
  if (!ref) fail('usage: dolly show <ref>');
  const task = store.resolve(ref);
  if (bool(args, 'json')) {
    jsonOut({ ...taskJson(task), spec_full: fullSpec(task), plan: readPlan(task) || null });
    return;
  }
  process.stdout.write(`${renderShow(task, { full: bool(args, 'full') })}\n`);
}

function cmdContext(args: Args, refOverride?: string): void {
  const store = openStore();
  const ref = refOverride ?? args.positional[1] ?? 'current';
  const task = store.resolve(ref);
  const brief = bool(args, 'brief');
  const steps = brief ? 0 : (num(args, 'limit') ?? num(args, 'steps') ?? 3);
  if (bool(args, 'json')) {
    jsonOut({
      ...taskJson(task),
      spec_full: fullSpec(task),
      plan: readPlan(task) || null,
      markdown: renderContext(task, { steps, brief }),
    });
    return;
  }
  process.stdout.write(`${renderContext(task, { steps, brief })}\n`);
}

function cmdNew(args: Args): void {
  const store = openStore(false);
  store.init();
  const title = args.positional.slice(1).join(' ').trim();
  if (!title) fail('usage: dolly new "<title>"');
  const short = textFrom(args, { inline: 'short' });
  const full = textFrom(args, { inline: 'full', file: 'file' }) ?? pipedStdin();
  const task = createTask(store, {
    title,
    status: str(args, 'status'),
    tags: list(args, 'tag'),
    specShort: short ?? (full ? full.split('\n').slice(0, 5).join('\n') : undefined),
    specFull: full,
    criteria: repeated(args, 'criteria'),
  });
  afterWrite(store);
  if (bool(args, 'json')) return jsonOut(taskJson(task));
  process.stdout.write(`${color.bold(task.meta.id)} ${task.meta.title} → ${task.meta.status}\n`);
  process.stdout.write(`${color.dim(task.dir)}\n`);
}

function cmdStep(args: Args): void {
  const store = openStore();
  const ref = args.positional[1] ?? 'current';
  const task = store.resolve(ref, false);
  const summary = str(args, 'summary') ?? args.positional.slice(2).join(' ').trim();
  if (!summary) fail('usage: dolly step <ref> -m "<summary>"');

  let files = list(args, 'files');
  if (bool(args, 'auto-files')) {
    const changed = changedFiles(store.project).filter((f) => !f.startsWith('.dolly/'));
    files = [...new Set([...files, ...changed])];
  }
  const detail = textFrom(args, { inline: 'detail', file: 'detail-file' }) ?? pipedStdin();
  const n = addStep(store, task, {
    summary,
    files,
    detail,
    status: str(args, 'status'),
  });
  afterWrite(store);
  if (bool(args, 'json')) return jsonOut({ task: task.meta.id, step: n, ...taskJson(task) });
  process.stdout.write(
    `step ${String(n).padStart(4, '0')} logged on ${task.meta.id} ${task.meta.slug}` +
      `${files.length ? color.dim(` · ${files.length} file(s)`) : ''}` +
      `${detail ? color.dim(' · full context saved') : color.dim(' · no full context (add --detail-file)')}\n`,
  );
}

function cmdSpec(args: Args): void {
  const store = openStore();
  const ref = args.positional[1] ?? 'current';
  const task = store.resolve(ref, false);
  const short = textFrom(args, { inline: 'short', file: 'short-file' });
  const full = textFrom(args, { inline: 'full', file: 'file' }) ?? pipedStdin();
  const crit = repeated(args, 'criteria');
  if (!short && !full && !crit.length) {
    fail('nothing to change — pass --short, --file/--full, or --criteria');
  }
  const v = updateSpec(store, task, {
    short,
    full,
    criteria: crit,
    reason: str(args, 'reason'),
  });
  afterWrite(store);
  if (bool(args, 'json')) return jsonOut({ task: task.meta.id, spec_version: v });
  process.stdout.write(
    `spec of ${task.meta.id} now v${v}` +
      (full ? ` ${color.dim('· previous version kept in context/spec.md')}` : ` ${color.dim('· short spec only')}`) +
      '\n',
  );
}

function cmdStatus(args: Args): void {
  const store = openStore();
  const ref = args.positional[1];
  const status = args.positional[2];
  if (!ref || !status) {
    fail(`usage: dolly status <ref> <${store.config.statuses.join('|')}> [--note t]`);
  }
  const task = store.resolve(ref, false);
  const from = task.meta.status;
  setStatus(store, task, status, str(args, 'note'));
  afterWrite(store);
  if (bool(args, 'json')) return jsonOut(taskJson(task));
  process.stdout.write(`${task.meta.id} ${from} → ${task.meta.status}\n`);
  if (status === store.config.reviewStatus) {
    process.stdout.write(color.yellow('human review needed — agent should stop here\n'));
  }
}

function cmdRetitle(args: Args): void {
  const store = openStore();
  const ref = args.positional[1];
  const title = args.positional.slice(2).join(' ').trim() || str(args, 'title');
  if (!ref || !title) fail('usage: dolly retitle <ref> "<new title>"');
  const task = store.resolve(ref, false);
  const from = task.meta.title;
  const moved = retitle(store, task, title);
  afterWrite(store);
  if (bool(args, 'json')) return jsonOut(taskJson(moved));
  process.stdout.write(`${moved.meta.id}: "${from}" → "${moved.meta.title}"\n`);
  if (moved.rel !== task.rel) process.stdout.write(`${color.dim(`moved → ${moved.rel}`)}\n`);
}

function cmdArchive(args: Args): void {
  const store = openStore();
  const ref = args.positional[1];
  if (!ref) fail('usage: dolly archive <ref>');
  const task = store.resolve(ref, false);
  const moved = archiveTask(store, task, str(args, 'note'));
  process.stdout.write(`${moved.meta.id} archived → ${moved.rel}\n`);
}

function cmdRestore(args: Args): void {
  const store = openStore();
  const ref = args.positional[1];
  if (!ref) fail('usage: dolly restore <ref>');
  const task = store.resolve(ref, true);
  if (!task.archived) fail(`${task.meta.id} is not archived`);
  const moved = restoreTask(store, task);
  process.stdout.write(`${moved.meta.id} restored → ${moved.rel}\n`);
}

function cmdPlan(args: Args): void {
  const sub = args.positional[1];
  if (!sub) fail('usage: dolly plan <start|show|set|qa|check|finalize> ...');

  if (sub === 'start') {
    const store = openStore(false);
    store.init();
    const title = args.positional.slice(2).join(' ').trim();
    if (!title) fail('usage: dolly plan start "<title>" [--brief t]');
    const brief = textFrom(args, { inline: 'brief', file: 'brief-file' }) ?? pipedStdin() ?? '';
    const task = startPlan(store, title, brief);
    afterWrite(store);
    if (bool(args, 'json')) {
      return jsonOut({ ...taskJson(task), plan: readPlan(task), prompts: PLAN_PROMPTS });
    }
    process.stdout.write(`${color.bold(task.meta.id)} ${task.meta.title} → planning\n`);
    process.stdout.write(`${color.dim(path.join(task.dir, 'context', 'plan.md'))}\n\n`);
    process.stdout.write('Interview agenda — ask the user about each:\n');
    for (const s of store.config.planSections) {
      process.stdout.write(`  ${color.cyan(s)} — ${PLAN_PROMPTS[s] ?? ''}\n`);
    }
    process.stdout.write(
      `\nFill with: ${color.bold('dolly plan set ' + task.meta.id + ' "<Section>" --text "..."')}\n`,
    );
    process.stdout.write(`Gate: ${color.bold('dolly plan check ' + task.meta.id)}\n`);
    return;
  }

  const store = openStore();
  const ref = args.positional[2] ?? 'current';

  if (sub === 'show') {
    const task = store.resolve(ref);
    const p = readPlan(task);
    if (!p) fail(`no plan for ${task.meta.id}`);
    if (bool(args, 'json')) return jsonOut({ task: task.meta.id, plan: p });
    process.stdout.write(`${p}\n`);
    return;
  }

  if (sub === 'set') {
    const task = store.resolve(ref, false);
    const section = args.positional[3];
    if (!section) fail('usage: dolly plan set <ref> "<Section>" --text "..."');
    const text = textFrom(args, { inline: 'text', file: 'file' }) ?? pipedStdin();
    if (text === undefined) fail('need --text, --file, or piped stdin');
    setPlanSection(store, task, section, text);
    const check = checkPlan(store, task);
    if (bool(args, 'json')) return jsonOut({ task: task.meta.id, section, check });
    process.stdout.write(`plan ${task.meta.id} · "${section}" updated\n`);
    printCheck(check, false);
    return;
  }

  if (sub === 'qa') {
    const task = store.resolve(ref, false);
    const q = str(args, 'question');
    const a = str(args, 'answer');
    if (!q || !a) fail('usage: dolly plan qa <ref> -q "<question>" -a "<answer>"');
    addPlanQA(store, task, q, a);
    if (bool(args, 'json')) return jsonOut({ task: task.meta.id, ok: true });
    process.stdout.write(`plan ${task.meta.id} · Q&A recorded\n`);
    return;
  }

  if (sub === 'check') {
    const task = store.resolve(ref);
    const check = checkPlan(store, task);
    if (bool(args, 'json')) return jsonOut({ task: task.meta.id, ...check });
    printCheck(check, true);
    if (!check.ok) process.exitCode = 1;
    return;
  }

  if (sub === 'finalize') {
    const task = store.resolve(ref, false);
    const check = finalizePlan(store, task, {
      short: textFrom(args, { inline: 'short' }),
      full: textFrom(args, { inline: 'full', file: 'file' }),
      force: bool(args, 'force'),
      nextStatus: str(args, 'status'),
    });
    afterWrite(store);
    if (!check.ok) {
      if (bool(args, 'json')) {
        jsonOut({ task: task.meta.id, ...check, ok: false });
      } else {
        process.stderr.write('plan incomplete — finalize blocked\n');
        printCheck(check, true);
        process.stderr.write(`\noverride with --force\n`);
      }
      process.exitCode = 1;
      return;
    }
    if (bool(args, 'json')) return jsonOut({ ...taskJson(task), ok: true });
    process.stdout.write(
      `plan ${task.meta.id} finalized · spec v${task.meta.spec_version} · status ${task.meta.status}\n`,
    );
    return;
  }

  fail(`unknown plan subcommand "${sub}"`);
}

function printCheck(check: ReturnType<typeof checkPlan>, verbose: boolean): void {
  if (check.ok) {
    process.stdout.write(`${color.green('plan complete')} — ready for \`dolly plan finalize\`\n`);
    return;
  }
  if (check.missing.length) {
    process.stdout.write(`${color.yellow('unfilled sections')} (${check.missing.length}):\n`);
    for (const m of check.missing) {
      process.stdout.write(`  ${color.cyan(m)}${verbose ? ` — ${check.prompts[m] ?? ''}` : ''}\n`);
    }
  }
  if (check.openQuestions.length) {
    process.stdout.write(`${color.yellow('open questions')} (${check.openQuestions.length}):\n`);
    for (const q of check.openQuestions) process.stdout.write(`  - ${q}\n`);
  }
  if (verbose) {
    process.stdout.write(
      `\n${color.dim('ask the user, then: dolly plan qa <ref> -q "..." -a "..." · dolly plan set <ref> "<Section>" --text "..."')}\n`,
    );
  }
}

function cmdHousekeep(args: Args): void {
  const store = openStore();
  const report = housekeep(store, { dryRun: bool(args, 'dry-run') });
  if (bool(args, 'json')) return jsonOut({ ...report, config: store.config.housekeep });
  const last = lastRun(store);
  process.stdout.write(
    `housekeeping${report.dryRun ? ' (dry run)' : ''} · last run ${last ? humanAge(last) : 'never'}\n`,
  );
  if (!report.actions.length) {
    process.stdout.write(color.dim('nothing to do\n'));
    return;
  }
  for (const a of report.actions) {
    process.stdout.write(`  ${color.cyan(a.kind.padEnd(15))} ${a.task.padEnd(28)} ${a.detail}\n`);
  }
  process.stdout.write(
    `\n${report.actions.length} action(s)${report.dryRun ? ' — rerun without --dry-run to apply' : ' applied'}\n`,
  );
}

function cmdReindex(args: Args): void {
  const store = openStore(false);
  const cwd = store.project;

  if (bool(args, 'list')) {
    const sessions = listSessions(cwd);
    if (bool(args, 'json')) return jsonOut({ cwd, sessions });
    if (!sessions.length) {
      process.stdout.write(`no Claude Code transcripts found for ${cwd}\n`);
      return;
    }
    process.stdout.write(`transcripts for ${cwd}\n`);
    sessions.forEach((s, i) => {
      const when = new Date(s.mtime).toISOString().replace(/\.\d+Z$/, 'Z');
      const kb = `${Math.round(s.size / 1024)}kb`;
      process.stdout.write(
        `  ${i === 0 ? color.green('▸') : ' '} ${s.sessionId.slice(0, 8)}  ${when}  ${kb.padStart(7)}` +
          `${i === 0 ? color.dim('  (newest — the live session)') : ''}\n`,
      );
    });
    return;
  }

  const opts: ReindexOpts = {
    session: str(args, 'session'),
    file: str(args, 'file'),
    allTurns: bool(args, 'all-turns'),
    limit: num(args, 'limit'),
    into: str(args, 'into'),
    title: str(args, 'title'),
    status: str(args, 'status'),
    apply: bool(args, 'apply'),
    rebuild: bool(args, 'rebuild'),
    includeThinking: bool(args, 'include-thinking') || store.config.reindex.includeThinking,
  };

  const transcript = loadTranscript(cwd, opts);
  const segments = selectSegments(transcript, opts);

  if (!opts.apply) {
    let target: Task | null = null;
    if (store.exists) {
      try {
        target = store.resolve(opts.into ?? 'current', false);
      } catch {
        target = null;
      }
    }
    const imported = target ? importedTurns(target) : new Set<string>();
    if (bool(args, 'json')) {
      return jsonOut({
        session: transcript.sessionId,
        file: transcript.file,
        title: transcript.title,
        cwd: transcript.cwd,
        branch: transcript.branch,
        startedAt: transcript.startedAt,
        endedAt: transcript.endedAt,
        tools: transcript.tools,
        target: target ? { id: target.meta.id, slug: target.meta.slug } : null,
        importedTurns: [...imported],
        segments,
        markdown: renderDigest(transcript, segments, imported, target),
      });
    }
    process.stdout.write(`${renderDigest(transcript, segments, imported, target)}\n`);
    return;
  }

  store.init();
  const res = applyReindex(store, transcript, opts);
  afterWrite(store);
  if (bool(args, 'json')) {
    return jsonOut({
      session: transcript.sessionId,
      created: res.created,
      imported: res.imported,
      skipped: res.skipped,
      rebuilt: res.rebuilt,
      ...taskJson(res.task),
    });
  }
  process.stdout.write(
    `${res.created ? 'created' : 'updated'} ${color.bold(res.task.meta.id)} ${res.task.meta.title}\n`,
  );
  process.stdout.write(
    `imported ${res.imported} step(s) from session ${transcript.sessionId.slice(0, 8)}` +
      `${res.skipped ? `, skipped ${res.skipped} already present` : ''}` +
      `${res.rebuilt ? `, dropped ${res.rebuilt} for rebuild` : ''}\n`,
  );
  process.stdout.write(
    `${color.yellow('spec is a mechanical import')} — replace it with a written one:\n` +
      `  dolly spec ${res.task.meta.id} --short "<2-5 lines>" --file <spec.md> --reason "reindexed from session ${transcript.sessionId.slice(0, 8)}"\n`,
  );
}

/**
 * Reopen the Claude Code conversation a task was worked in. Prints the command
 * rather than executing it whenever exec would be wrong — inside Claude Code
 * (spawning an interactive TUI from a tool call) or with no terminal.
 */
function cmdContinue(args: Args): void {
  const store = openStore();
  const task = store.resolve(args.positional[1] ?? 'current');
  const sessions = task.meta.sessions;
  if (!sessions.length) {
    fail(
      `no conversation recorded for ${task.meta.id} — steps logged from inside Claude Code capture the session automatically`,
    );
  }
  const which = str(args, 'session');
  const id = which ? sessions.find((s) => s.startsWith(which)) : sessions[sessions.length - 1];
  if (!id) fail(`no session matching "${which}" on ${task.meta.id} — has: ${sessions.join(', ')}`);

  const fork = bool(args, 'fork');
  const cmd = resumeCommand(id, fork);

  if (bool(args, 'json')) {
    return jsonOut({ task: task.meta.id, session: id, sessions, command: cmd, fork });
  }
  if (bool(args, 'print') || insideClaudeCode() || !process.stdout.isTTY) {
    if (insideClaudeCode()) {
      process.stdout.write(
        `${color.dim('already inside Claude Code — run this in a terminal:')}\n`,
      );
    }
    process.stdout.write(`${cmd}\n`);
    if (sessions.length > 1) {
      process.stdout.write(
        color.dim(`${sessions.length} sessions on this task: ${sessions.map((s) => s.slice(0, 8)).join(', ')}\n`),
      );
    }
    return;
  }
  process.stdout.write(`${color.dim(`resuming ${id.slice(0, 8)} for ${task.meta.id}…`)}\n`);
  const res = spawnSync('claude', fork ? ['--resume', id, '--fork-session'] : ['--resume', id], {
    stdio: 'inherit',
  });
  if (res.error) fail(`could not launch claude — run manually: ${cmd}`);
  process.exit(res.status ?? 0);
}

function cmdMigrate(args: Args): void {
  const store = openStore();
  const report = migrate(store, { dryRun: bool(args, 'dry-run') });
  if (bool(args, 'json')) return jsonOut(report);
  if (!report.actions.length) {
    process.stdout.write(`${color.dim('store layout already current — nothing to migrate')}\n`);
    return;
  }
  for (const a of report.actions) {
    process.stdout.write(`  ${color.cyan(a.kind.padEnd(6))} ${a.task.padEnd(28)} ${a.detail}\n`);
  }
  process.stdout.write(
    `\n${report.actions.length} change(s)${report.dryRun ? ' — rerun without --dry-run to apply' : ' applied'}\n`,
  );
}

function cmdConfig(args: Args): void {
  const store = openStore();
  const sub = args.positional[1];
  if (!sub || sub === 'get') {
    const key = args.positional[2];
    if (!key) return jsonOut(store.config);
    return jsonOut(dig(store.config as unknown as Record<string, unknown>, key));
  }
  if (sub === 'set') {
    const key = args.positional[2];
    const raw = args.positional.slice(3).join(' ');
    if (!key || raw === '') fail('usage: dolly config set <key> <value>');
    const next = JSON.parse(JSON.stringify(store.config));
    setDeep(next, key, coerce(raw));
    writeJson(store.configPath, next);
    return jsonOut(dig(next, key));
  }
  fail(`unknown config subcommand "${sub}" — use get|set`);
}

function dig(obj: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], obj);
}

function setDeep(obj: Record<string, any>, key: string, value: unknown): void {
  const parts = key.split('.');
  let cur = obj;
  for (const p of parts.slice(0, -1)) {
    cur[p] = cur[p] ?? {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function coerce(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  if (raw.startsWith('[') || raw.startsWith('{')) {
    try {
      return JSON.parse(raw);
    } catch {
      /* fall through to string */
    }
  }
  if (raw.includes(',')) return raw.split(',').map((s) => s.trim());
  return raw;
}

function cmdWhoami(args: Args): void {
  const store = Store.open();
  const data = {
    user: store.user,
    source: store.identity.source,
    store: store.root,
    storeKind: store.kind,
    project: store.project,
    initialized: store.exists,
  };
  if (bool(args, 'json')) return jsonOut(data);
  process.stdout.write(`@${store.user} ${color.dim(`(${store.identity.source})`)}\n`);
  process.stdout.write(`store ${store.root} ${color.dim(`(${store.kind}${store.exists ? '' : ', not initialized'})`)}\n`);
}

function cmdInstall(args: Args): void {
  if (bool(args, 'list')) {
    for (const t of TARGETS) {
      const hit = t.detect(Store.open().project);
      process.stdout.write(`  ${hit ? color.green('✓') : color.dim('·')} ${t.id.padEnd(10)} ${t.label}\n`);
    }
    return;
  }
  const store = Store.open();
  const ids = [...args.positional.slice(1), ...list(args, 'agents')];
  const opts = installOpts(args, store);
  const results = installTargets(store.project, ids, opts);
  if (!results.length) {
    process.stdout.write(
      `no agents detected. pick explicitly: ${TARGETS.map((t) => t.id).join(', ')}\n`,
    );
    return;
  }
  process.stdout.write(`scope: ${color.bold(opts.global ? 'global' : 'local')}\n`);
  for (const r of results) {
    process.stdout.write(`${color.bold(r.target.label)}\n`);
    for (const line of r.log) process.stdout.write(`  ${line}\n`);
  }
  if (bool(args, 'dry-run')) process.stdout.write(`\n${color.dim('dry run — nothing written')}\n`);
}

/* --------------------------------- hooks --------------------------------- */

function cmdHook(args: Args): void {
  const which = args.positional[1];
  const store = Store.open();
  if (!store.exists) {
    if (which === 'session-start') emitSessionStart('');
    return;
  }
  const tasks = store.loadTasks(false);
  const active = currentTask(tasks, store.config);

  if (which === 'session-start') {
    const lines: string[] = [];
    const counts = store.config.statuses
      .map((s) => ({ s, n: tasks.filter((t) => t.meta.status === s).length }))
      .filter((x) => x.n > 0)
      .map((x) => `${x.s} ${x.n}`)
      .join(' · ');
    lines.push(`dolly store: ${store.root}${counts ? ` — ${counts}` : ' — empty'}`);
    if (active) {
      lines.push('');
      lines.push(`Active task ${active.meta.id} "${active.meta.title}" (${active.meta.status}), ${active.meta.steps} steps, updated ${humanAge(active.meta.updated)}.`);
      lines.push('');
      lines.push('## Spec (short)');
      lines.push(shortSpec(active) || '_empty_');
      lines.push('');
      lines.push('## Success Criteria');
      lines.push(criteria(active) || '_empty_');
      const recent = tailLines(logSection(active), 6);
      if (recent) {
        lines.push('');
        lines.push('## Most recent events');
        lines.push(recent);
      }
      lines.push('');
      lines.push('## How to read the rest');
      lines.push(
        `What you see above is the index, not the record. Before touching code on this task run \`dolly context ${active.meta.id}\` — it adds the full spec plus the last few steps' full context (decisions, options rejected, gotchas). \`--brief\` for spec + log only; \`-n 0\` for the entire history, which you rarely need.`,
      );
      lines.push(
        `Log progress with \`dolly step ${active.meta.id} -m "<what you understood and did>" --auto-files --detail-file <notes>\`. Summaries state outcomes, not the request.`,
      );
      if (active.meta.sessions.length) {
        lines.push(
          `Earlier conversations on this task: ${active.meta.sessions.map((x) => x.slice(0, 8)).join(', ')} — \`dolly continue ${active.meta.id}\` reopens the latest.`,
        );
      }
    } else {
      lines.push('');
      lines.push('No active task. `dolly board` to see the board. New feature → `dolly plan start "<title>"`. Small fix → `dolly new "<title>"`.');
    }
    emitSessionStart(lines.join('\n'));
    return;
  }

  if (which === 'stop') {
    if (!active) return;
    const hk = store.config.reindex;
    const working = active.meta.status === 'working';

    // Auto-log: append a mechanical step for the turn that just ended, unless
    // the agent already logged one itself (which bumps `updated` past the turn's
    // start). This is what makes "a step at every major point" hold without
    // relying on the agent to remember.
    if (hk.autoLog && (working || !hk.autoLogOnlyWhenWorking)) {
      const before = active.meta.updated;
      try {
        const transcript = loadTranscript(store.project, {
          includeThinking: hk.includeThinking,
        });
        const res = applyReindex(store, transcript, {
          into: active.meta.id,
          onlyNewerThan: before,
          includeThinking: hk.includeThinking,
          allTurns: true,
        });
        if (res.imported > 0) {
          process.stdout.write(
            `${JSON.stringify({
              systemMessage: `dolly: auto-logged ${res.imported} step(s) on ${active.meta.id} from this turn. Improve the summary with \`dolly step ${active.meta.id} -m "..."\` if it reads thin.`,
            })}\n`,
          );
          return;
        }
      } catch {
        /* no transcript, or a live-write race — fall through to the nudge */
      }
    }

    // Never block the stop — just surface a nudge, and only when the active task
    // has genuinely gone quiet.
    if (!working) return;
    if (Date.parse(active.meta.updated) >= Date.now() - 30 * 60_000) return;
    process.stdout.write(
      `${JSON.stringify({
        systemMessage: `dolly: task ${active.meta.id} "${active.meta.title}" is still \`working\` — last step ${humanAge(active.meta.updated)}. Log a step (\`dolly step ${active.meta.id} -m "..." --auto-files --detail-file <notes>\`) or move it to \`validating\`.`,
      })}\n`,
    );
    return;
  }
  fail(`unknown hook "${which}" — use session-start|stop`);
}

/** last N non-empty lines of a section — a cheap "what just happened" view */
function tailLines(text: string, n: number): string {
  const lines = text.split('\n').filter((l) => l.trim());
  return lines.slice(-n).join('\n');
}

function emitSessionStart(context: string): void {
  if (!context.trim()) return;
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context },
    })}\n`,
  );
}

function cmdStatusline(): void {
  const store = Store.open();
  if (!store.exists) return;
  const tasks = store.loadTasks(false);
  const active = currentTask(tasks, store.config);
  if (!active) {
    const n = tasks.length;
    process.stdout.write(`🐕 ${n} task${n === 1 ? '' : 's'}\n`);
    return;
  }
  process.stdout.write(
    `🐕 ${active.meta.id} ${active.meta.slug} · ${active.meta.status} · ${active.meta.steps}✎\n`,
  );
}

/* --------------------------------- dispatch ------------------------------ */

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const cmd = args.positional[0];

  if (bool(args, 'version') || cmd === 'version') {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (!cmd || cmd === 'help' || bool(args, 'help')) {
    process.stdout.write(`${HELP}\n`);
    return;
  }

  switch (cmd) {
    case 'init':
      return cmdInit(args);
    case 'board':
    case 'list':
    case 'ls':
      return cmdBoard(args);
    case 'show':
      return cmdShow(args);
    case 'context':
      return cmdContext(args);
    case 'current':
      return cmdContext(args, 'current');
    case 'new':
    case 'add':
      return cmdNew(args);
    case 'step':
      return cmdStep(args);
    case 'spec':
      return cmdSpec(args);
    case 'status':
    case 'move':
      return cmdStatus(args);
    case 'retitle':
    case 'rename':
      return cmdRetitle(args);
    case 'archive':
      return cmdArchive(args);
    case 'restore':
      return cmdRestore(args);
    case 'plan':
      return cmdPlan(args);
    case 'reindex':
    case 'adopt':
      return cmdReindex(args);
    case 'continue':
    case 'resume':
      return cmdContinue(args);
    case 'migrate':
      return cmdMigrate(args);
    case 'housekeep':
    case 'hk':
      return cmdHousekeep(args);
    case 'config':
      return cmdConfig(args);
    case 'whoami':
      return cmdWhoami(args);
    case 'install':
      return cmdInstall(args);
    case 'mcp':
      return runMcpServer();
    case 'hook':
      return cmdHook(args);
    case 'statusline':
      return cmdStatusline();
    case 'defaults':
      return jsonOut(DEFAULT_CONFIG);
    default:
      fail(`unknown command "${cmd}" — \`dolly help\``);
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`dolly: ${msg}\n`);
  process.exit(1);
});
