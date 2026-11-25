// Which task a conversation's turns land on, and one writer at a time.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { Store, currentTask, isStale } from '../dist/core/store.js';
import { createTask, linkSession, logSection, reload, saveTask, setStatus, stepEntries } from '../dist/core/task.js';
import { withStoreLock } from '../dist/core/lock.js';
import { ageTask, daysAgo, sandbox } from './helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'dist', 'cli.js');

function run(cwd, args, { input, env = {} } = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    input,
    encoding: 'utf8',
    env: { ...process.env, DOLLY_USER: 'tester', NO_COLOR: '1', ...env },
  });
  return { out: r.stdout ?? '', err: r.stderr ?? '', code: r.status };
}

const attach = (task, session) => {
  linkSession(task, session);
  saveTask(task);
};
const stopTurn = (session, text, extra = {}) =>
  JSON.stringify({ session_id: session, response: text, ...extra });

test('a conversation never auto-logs onto a task it did not touch', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const stale = createTask(store, { title: 'Old zcode work' });
  setStatus(store, stale, 'working');
  attach(stale, 'long-gone');

  run(sb.dir, ['hook', 'stop', '--from-stdin'], { input: stopTurn('review-session', 'Reviewed the repo.') });
  assert.equal(reload(store, stale).meta.steps, 0, 'the stale working task stays untouched');
  assert.doesNotMatch(logSection(reload(store, stale)), /Reviewed the repo/);
});

test('each conversation logs onto its own task', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const a = createTask(store, { title: 'Task A' });
  setStatus(store, a, 'working');
  attach(a, 'sess-a');
  const b = createTask(store, { title: 'Task B' });
  setStatus(store, b, 'working');
  attach(b, 'sess-b'); // B is newer — recency alone would pick it

  run(sb.dir, ['hook', 'stop', '--from-stdin'], { input: stopTurn('sess-a', 'Work for A.') });
  assert.match(logSection(reload(store, a)), /Work for A/);
  assert.doesNotMatch(logSection(reload(store, b)), /Work for A/);
});

test('current prefers this conversation, then your own tasks', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const mine = createTask(store, { title: 'Mine' });
  setStatus(store, mine, 'working');
  ageTask(mine.dir, daysAgo(1)); // older than the teammate's, so recency alone picks theirs
  process.env.DOLLY_USER = 'teammate';
  const theirs = createTask(Store.open(), { title: 'Theirs' });
  setStatus(Store.open(), theirs, 'working');
  process.env.DOLLY_USER = 'tester';

  const tasks = Store.open().loadTasks();
  assert.equal(currentTask(tasks, store.config).meta.id, theirs.meta.id, 'no context: plain recency');
  assert.equal(currentTask(tasks, store.config, { user: 'tester' }).meta.id, mine.meta.id);
  attach(reload(store, theirs), 'my-session');
  assert.equal(
    currentTask(Store.open().loadTasks(), store.config, { session: 'my-session', user: 'tester' }).meta.id,
    theirs.meta.id,
    'a task this conversation wrote to wins',
  );
});

test('`dolly status X working` on a working task attaches this conversation', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Pick up' });
  setStatus(store, task, 'working');
  run(sb.dir, ['status', task.meta.id, 'working'], { env: { DOLLY_SESSION_ID: 'new-conv' } });
  assert.deepEqual(reload(store, task).meta.sessions, ['new-conv']);
  // and now its turns are logged
  run(sb.dir, ['hook', 'stop', '--from-stdin'], { input: stopTurn('new-conv', 'Continued the work.') });
  assert.match(logSection(reload(store, task)), /Continued the work/);
});

test('inside opencode, OPENCODE_SESSION_ID attaches the task and the plugin turn is auto-logged', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'opencode pick up' });
  // opencode started from a Claude Code terminal inherits Claude's id too: the
  // innermost harness — opencode — is the conversation
  run(sb.dir, ['status', task.meta.id, 'working'], {
    env: { OPENCODE_SESSION_ID: 'ses_oc1', CLAUDE_CODE_SESSION_ID: 'outer-claude' },
  });
  assert.deepEqual(reload(store, task).meta.sessions, ['ses_oc1']);
  // the payload the generated opencode plugin sends at the end of a turn
  const turn = {
    agent: 'opencode',
    session: 'ses_oc1',
    turn: 'msg_1',
    turnStartMs: Date.now() + 2000,
    text: 'Added the theme constant.',
    tools: ['write'],
    files: ['theme.ts'],
  };
  run(sb.dir, ['hook', 'stop', '--from-stdin'], { input: JSON.stringify(turn) });
  const after = reload(store, task);
  assert.equal(after.meta.steps, 1);
  assert.match(logSection(after), /Added the theme constant/);
});

test('`dolly continue` reopens an opencode session in opencode, and refuses to fork it', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Worked in opencode' });
  attach(task, 'ses_oc2');
  const r = run(sb.dir, ['continue', task.meta.id, '--print']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^opencode --session ses_oc2$/m);
  const fork = run(sb.dir, ['continue', task.meta.id, '--fork', '--print']);
  assert.notEqual(fork.code, 0);
  assert.match(fork.err, /opencode cannot fork/);
  assert.doesNotMatch(fork.out, /claude --resume/);
});

test('without a start time, a step the agent logged mid-turn suppresses the auto-step', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'zcode turns' });
  setStatus(store, task, 'working');
  attach(task, 'zc');
  const hook = (text) => run(sb.dir, ['hook', 'stop', '--from-stdin'], { input: stopTurn('zc', text) });

  hook('Turn one.');
  assert.equal(reload(store, task).meta.steps, 1);
  hook('Turn two.'); // nobody logged in between: this one is logged too
  assert.equal(reload(store, task).meta.steps, 2);
  run(sb.dir, ['step', task.meta.id, '-m', 'The agent wrote its own summary.'], { env: { DOLLY_SESSION_ID: 'zc' } });
  hook('Turn three.');
  const after = reload(store, task);
  assert.equal(after.meta.steps, 3, 'turn three was already logged by the agent');
  assert.doesNotMatch(logSection(after), /Turn three/);
});

test('parallel writers never lose or duplicate a step', async (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Race' });
  const N = 8;
  await Promise.all(
    Array.from({ length: N }, (_, i) =>
      new Promise((resolve, reject) => {
        const p = spawn(process.execPath, [CLI, 'step', task.meta.id, '-m', `parallel ${i}`, '--detail', `d${i}`], {
          env: { ...process.env, DOLLY_USER: 'tester', NO_COLOR: '1' },
          stdio: 'ignore',
        });
        p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
      }),
    ),
  );
  const after = reload(store, task);
  assert.equal(after.meta.steps, N);
  const ids = stepEntries(task.dir).map((e) => e.id);
  assert.equal(new Set(ids).size, N, `distinct ids: ${ids.join(',')}`);
  for (let i = 0; i < N; i++) assert.match(logSection(after), new RegExp(`parallel ${i}\\b`));
});

test('a lock left by a dead process is cleared, not waited on', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  store.init();
  const file = path.join(store.root, '.local', 'write.lock');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // a pid that is certainly not running
  fs.writeFileSync(file, '999999 step\n');
  const started = Date.now();
  assert.equal(withStoreLock(store.root, 'test', () => 'ran'), 'ran');
  assert.ok(Date.now() - started < 2000);
  assert.equal(fs.existsSync(file), false, 'released after');
  assert.match(fs.readFileSync(path.join(store.root, '.gitignore'), 'utf8'), /^\.local\/$/m);
});

test('the plugin hook steps aside when settings.json already runs dolly', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Plugin', specShort: 'x' });
  setStatus(store, task, 'working');
  const shim = path.join(ROOT, 'bin', 'dolly-hook.mjs');
  const env = { ...process.env, DOLLY_USER: 'tester', CLAUDE_PROJECT_DIR: sb.dir, HOME: sb.dir };
  const ss = () => spawnSync(process.execPath, [shim, 'hook', 'session-start'], { cwd: sb.dir, env, encoding: 'utf8', input: '{}' });
  assert.match(ss().stdout, /additionalContext/, 'alone, the plugin injects');
  fs.mkdirSync(path.join(sb.dir, '.claude'), { recursive: true });
  fs.writeFileSync(
    path.join(sb.dir, '.claude', 'settings.json'),
    JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'dolly hook session-start' }] }] } }),
  );
  assert.equal(ss().stdout, '', 'beside settings hooks, it stays silent');
});

test('a user-level install on top of the plugin adds nothing twice', (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-plug-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  fs.mkdirSync(path.join(home, '.claude', 'plugins'), { recursive: true });
  fs.writeFileSync(
    path.join(home, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({ version: 2, plugins: { 'dolly@dolly': [{ scope: 'user' }] } }),
  );
  const r = spawnSync(process.execPath, [CLI, 'install', 'claude', '--global', '--mcp'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, HOME: home, DOLLY_HOME: home, DOLLY_DIR: path.join(root, '.dolly'), DOLLY_USER: 't', NO_COLOR: '1' },
  });
  assert.match(r.stdout, /the dolly plugin is enabled and provides them/);
  assert.equal(fs.existsSync(path.join(home, '.claude', 'skills')), false);
  assert.equal(fs.existsSync(path.join(home, '.claude.json')), false);
  assert.match(fs.readFileSync(path.join(home, '.claude', 'CLAUDE.md'), 'utf8'), /dolly:instructions/);
});

test('generated harness plugins are valid JavaScript', (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-gen-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  fs.mkdirSync(path.join(home, '.pi', 'agent'), { recursive: true });
  const env = { ...process.env, HOME: home, DOLLY_HOME: home, DOLLY_DIR: path.join(root, '.dolly'), DOLLY_USER: 't' };
  spawnSync(process.execPath, [CLI, 'install', 'opencode', 'pi', '--global'], { cwd: root, env });
  for (const f of [
    path.join(home, '.config', 'opencode', 'plugins', 'dolly.js'),
    path.join(home, '.pi', 'agent', 'extensions', 'dolly.ts'),
  ]) {
    const copy = path.join(root, `${path.basename(f)}.mjs`);
    fs.copyFileSync(f, copy);
    const r = spawnSync(process.execPath, ['--check', copy], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${f}: ${r.stderr}`);
  }
});

test('a todo task the conversation created never steals current from the one it is working', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const work = createTask(store, { title: 'The real work' });
  setStatus(store, work, 'working');
  attach(reload(store, work), 'conv');
  ageTask(work.dir, daysAgo(1));
  // mid-work, the agent files a follow-up: `dolly new` attaches the conversation too
  const later = createTask(Store.open(), { title: 'Follow-up idea' });
  attach(later, 'conv');
  const pick = () => currentTask(Store.open().loadTasks(), store.config, { session: 'conv', user: 'tester' }).meta.id;
  assert.equal(pick(), work.meta.id, 'todo is not being worked');

  // a newer planning task in the same conversation does not win over working either
  const plan = createTask(Store.open(), { title: 'Next feature', status: 'planning' });
  attach(plan, 'conv');
  assert.equal(pick(), work.meta.id, 'working beats a newer planning task');

  // and the CLI's `step current` lands on the working task
  const r = run(sb.dir, ['step', 'current', '-m', 'Logged on the right task.'], { env: { DOLLY_SESSION_ID: 'conv' } });
  assert.equal(r.code, 0, r.err);
  assert.match(logSection(reload(store, work)), /Logged on the right task/);
  assert.doesNotMatch(logSection(reload(store, later)), /Logged on the right task/);
});

test('an agent cannot close a task — status, step, new and finalize all refuse done', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Closing' });
  setStatus(store, task, 'validating');
  const agent = { CLAUDECODE: '1' };
  for (const args of [
    ['status', task.meta.id, 'done'],
    ['step', task.meta.id, '-m', 'x', '--status', 'done'],
    ['new', 'Born closed', '--status', 'done'],
    ['plan', 'finalize', task.meta.id, '--force', '--status', 'done'],
  ]) {
    const r = run(sb.dir, args, { env: agent });
    assert.equal(r.code, 1, `${args.join(' ')} should refuse`);
    assert.match(r.err, /only a person closes a task/);
  }
  assert.equal(reload(store, task).meta.status, 'validating');
  assert.equal(Store.open().loadTasks().length, 1, 'no task was created');
});

test('an idle task is not offered as current, unless this conversation is on it', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const old = createTask(store, { title: 'Forgotten work' });
  setStatus(store, old, 'working');
  attach(reload(store, old), 'old-conv');
  ageTask(old.dir, daysAgo(40));
  const cfg = store.config;
  const tasks = () => Store.open().loadTasks();
  assert.equal(isStale(tasks()[0], cfg), true);
  assert.equal(currentTask(tasks(), cfg, { user: 'tester' }), null, 'a new conversation is not handed a 40-day-old task');
  assert.equal(currentTask(tasks(), cfg, { session: 'old-conv' }).meta.id, old.meta.id, 'the conversation that wrote to it keeps it');
  assert.equal(currentTask(tasks(), { ...cfg, staleDays: 0 }).meta.id, old.meta.id, 'staleDays 0 turns it off');

  const r = run(sb.dir, ['step', 'current', '-m', 'x']);
  assert.equal(r.code, 1);
  assert.match(r.err, /1 open task\(s\) went idle over 14d/);

  const start = run(sb.dir, ['hook', 'session-start', '--raw'], { env: { DOLLY_SESSION_ID: 'fresh' } });
  assert.match(start.out, /No fresh open task \(1 idle over 14d/);
  assert.doesNotMatch(start.out, /Forgotten work/);

  const board = run(sb.dir, ['board']);
  assert.match(board.out, /idle 1mo/);
  assert.match(board.out, /1 open task idle over 14d/);

  // `status X working` picks it back up: fresh again
  run(sb.dir, ['status', old.meta.id, 'working'], { env: { DOLLY_SESSION_ID: 'new-conv' } });
  assert.equal(isStale(tasks()[0], cfg), false);
});

test('the board says how long the oldest hand-over has waited', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  for (const [title, days] of [['A', 30], ['B', 2]]) {
    const task = createTask(Store.open(), { title });
    setStatus(Store.open(), task, 'validating');
    ageTask(task.dir, daysAgo(days));
  }
  assert.match(run(sb.dir, ['board']).out, /2 awaiting a human, oldest 1mo/);
});
