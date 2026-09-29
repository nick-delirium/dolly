// Command-line behaviour from the 2026-09-29 review: switches that swallowed
// refs, a version gate keyed on command names, and stdin read without asking.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { parseArgs } from '../dist/core/args.js';
import { Store } from '../dist/core/store.js';
import { createTask, logSection, reload, setStatus } from '../dist/core/task.js';
import { sandbox } from './helpers.mjs';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');

function run(cwd, args, { input, env = {} } = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    input,
    encoding: 'utf8',
    env: { ...process.env, DOLLY_USER: 'tester', NO_COLOR: '1', ...env },
  });
  return { out: r.stdout ?? '', err: r.stderr ?? '', code: r.status };
}

test('a switch never swallows the ref after it', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const other = createTask(store, { title: 'Other task' });
  const cur = createTask(store, { title: 'Current one' });
  setStatus(store, cur, 'working');

  const ctx = run(sb.dir, ['context', '--brief', other.meta.id]);
  assert.match(ctx.out, new RegExp(`^# ${other.meta.id} · Other task`));
  assert.match(ctx.out, /Brief view/);

  run(sb.dir, ['step', '--auto-files', other.meta.id, '-m', 'landed on the named task']);
  assert.match(logSection(reload(store, other)), /landed on the named task/);
  assert.doesNotMatch(logSection(reload(store, cur)), /landed on the named task/);

  assert.equal(run(sb.dir, ['--json', 'board']).code, 0);
  assert.doesNotThrow(() => JSON.parse(run(sb.dir, ['--json', 'board']).out));
});

test('unknown flags fail loudly; values are taken even when they look like flags', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Flags' });

  const typo = run(sb.dir, ['step', task.meta.id, '-m', 'x', '--file', 'a.ts']);
  assert.equal(typo.code, 1);
  assert.match(typo.err, /unknown flag --file for "step".*--files/);

  run(sb.dir, ['step', task.meta.id, '-m', '--force was the wrong call']);
  assert.match(logSection(reload(store, task)), /--force was the wrong call/);

  const missing = run(sb.dir, ['step', task.meta.id, '-m']);
  assert.match(missing.err, /--summary needs a value/);
  assert.match(run(sb.dir, ['show', '--full=yes']).err, /is a switch/);

  // same flag name, different meaning per command
  const p = parseArgs(['spec', 'x', '--full', 'the spec'], { value: ['full'] });
  assert.equal(p.flags.full, 'the spec');
  const q = parseArgs(['show', '--full', 'x'], { bool: ['full'] });
  assert.equal(q.flags.full, true);
  assert.deepEqual(q.positional, ['show', 'x']);
});

test('stdin is read only on an explicit -', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Stdin' });
  // what `while read l; do dolly step … ; done` does: stdin is a pipe
  run(sb.dir, ['step', task.meta.id, '-m', 'first'], { input: 'second\nthird\n' });
  const after = reload(store, task);
  assert.doesNotMatch(fs.readFileSync(path.join(task.dir, 'context', 'steps.md'), 'utf8'), /second/);
  assert.equal(after.meta.steps, 1);

  run(sb.dir, ['step', task.meta.id, '-m', 'with detail', '--detail', '-'], { input: 'from stdin\n' });
  assert.match(fs.readFileSync(path.join(task.dir, 'context', 'steps.md'), 'utf8'), /from stdin/);
});

test('refs may be several words; an omitted ref is the current task', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const oauth = createTask(store, { title: 'OAuth login flow' });
  createTask(store, { title: 'Add payment page' });
  const cur = createTask(store, { title: 'Busy' });
  setStatus(store, cur, 'working');
  assert.match(run(sb.dir, ['show', 'oauth', 'login']).out, new RegExp(oauth.meta.id));
  assert.match(run(sb.dir, ['show']).out, new RegExp(cur.meta.id));
  assert.match(run(sb.dir, ['context']).out, new RegExp(`^# ${cur.meta.id} · `));
});

test('the version gate follows the operation, not the command name', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Gate' });
  setStatus(store, task, 'working');
  const cfg = JSON.parse(fs.readFileSync(store.configPath, 'utf8'));
  fs.writeFileSync(store.configPath, JSON.stringify({ ...cfg, version: 99 }));

  // reads work on a newer store
  assert.match(run(sb.dir, ['plan', 'check', task.meta.id]).err, /Reading anyway/);
  assert.equal(run(sb.dir, ['project']).code, 0);
  assert.equal(run(sb.dir, ['config', 'get', 'version']).out.trim(), '99');
  // writes do not
  assert.match(run(sb.dir, ['config', 'set', 'x', '1']).err, /upgrade dolly/);
  assert.match(run(sb.dir, ['project', 'set', 'Overview', '--text', 'x']).err, /upgrade dolly/);
  // and the hook that writes most often is silent about it, and writes nothing
  const before = fs.readFileSync(path.join(task.dir, 'task.md'), 'utf8');
  const hook = run(sb.dir, ['hook', 'stop', '--from-stdin'], {
    input: JSON.stringify({ session: 's1', turn: 1, text: 'did a thing' }),
  });
  assert.equal(hook.code, 0);
  assert.equal(hook.err, '');
  assert.equal(fs.readFileSync(path.join(task.dir, 'task.md'), 'utf8'), before);
});

test('a hook never fails its host, even on a broken store', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  createTask(store, { title: 'x' });
  fs.writeFileSync(store.configPath, '{"version":');
  for (const which of ['session-start', 'stop']) {
    const r = run(sb.dir, ['hook', which], { input: '{}' });
    assert.equal(r.code, 0, which);
    assert.equal(r.err, '', which);
  }
  // an ordinary command says what is wrong instead
  assert.match(run(sb.dir, ['board']).err, /not valid JSON/);
});

test('init --dry-run creates nothing', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const r = run(sb.dir, ['init', '--yes', '--dry-run', '--no-agents']);
  assert.match(r.out, /would create/);
  assert.equal(fs.existsSync(sb.store), false);
});
