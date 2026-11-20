// Store v8: task.md is rendered from an append-only log.jsonl and never parsed
// back; teammates' offline work merges as a union; the migration is lossless.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { planCompaction, resolveStepId } from '../dist/core/compact.js';
import { fold, readEvents, renderFromLog } from '../dist/core/log.js';
import { Store } from '../dist/core/store.js';
import { addStep, createTask, logSection, reload, setStatus, stepEntries, updateSpec } from '../dist/core/task.js';
import { migrate } from '../dist/migrate.js';
import { sandbox } from './helpers.mjs';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');
const md = (task) => fs.readFileSync(path.join(task.dir, 'task.md'), 'utf8');
const logOf = (task) => path.join(task.dir, 'log.jsonl');

test('every write is one appended event, and task.md is exactly the fold of the log', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Logged', specShort: 'S1', criteria: ['c1'] });
  addStep(store, reload(store, task), { summary: 'did one', detail: 'D1', files: ['src/a.ts'] });
  addStep(store, reload(store, task), { summary: 'did two', detail: 'D2' });
  setStatus(store, reload(store, task), 'working');
  updateSpec(store, reload(store, task), { full: 'FULL-2', reason: 'grew' });

  const lines = fs.readFileSync(logOf(task), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(lines[0].base, 'the first line is the whole starting state');
  assert.match(lines[1].sec.Log, /did one/, 'the first entry replaces the placeholder');
  assert.deepEqual(lines[2].inc, { steps: 1 }, 'a step is a counter bump plus a log append');
  assert.match(lines[2].log, /^\n- `[^`]+` @tester: did two/);
  assert.equal(Object.keys(lines[2]).filter((k) => !['v', 'at', 'by'].includes(k)).sort().join(','), 'inc,log', 'nothing else');
  assert.equal(lines[3].set.status, 'working');
  assert.deepEqual(lines[4].inc, { spec_version: 1 });
  assert.equal(renderFromLog(task.dir), md(task));
});

test('a corrupted or deleted task.md changes nothing and comes back byte-identical', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Rebuild me' });
  addStep(store, reload(store, task), { summary: 'one', detail: 'x' });
  const good = md(task);
  // steps and spec_version are derived: deleting them from frontmatter changes no output
  fs.writeFileSync(path.join(task.dir, 'task.md'), good.replace(/^steps: .*\n/m, '').replace(/^spec_version: .*\n/m, ''));
  assert.equal(reload(store, task).meta.steps, 1);
  fs.rmSync(path.join(task.dir, 'task.md'));
  assert.equal(Store.open().resolve(task.meta.id).meta.title, 'Rebuild me', 'still readable from the log');
  const r = migrate(Store.open());
  assert.ok(r.actions.some((a) => /re-rendered/.test(a.detail)));
  assert.equal(md(task), good);
  assert.equal(migrate(Store.open()).actions.length, 0, 'idempotent');
});

test('two teammates offline: concatenated logs fold into the union, ids distinct, counters summed', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Shared' });
  addStep(store, reload(store, task), { summary: 'common', detail: 'C' });
  const common = fs.readFileSync(logOf(task), 'utf8');
  const commonSteps = fs.readFileSync(path.join(task.dir, 'context', 'steps.md'), 'utf8');

  // bob's branch
  process.env.DOLLY_USER = 'bob';
  addStep(Store.open(), reload(Store.open(), task), { summary: 'BOB-WORK', detail: 'B' });
  const bob = fs.readFileSync(logOf(task), 'utf8').slice(common.length);
  const bobSteps = fs.readFileSync(path.join(task.dir, 'context', 'steps.md'), 'utf8').slice(commonSteps.length);
  // back to the common point, alice's branch
  fs.writeFileSync(logOf(task), common);
  fs.writeFileSync(path.join(task.dir, 'context', 'steps.md'), commonSteps);
  process.env.DOLLY_USER = 'alice';
  addStep(Store.open(), reload(Store.open(), task), { summary: 'ALICE-WORK', detail: 'A' });
  setStatus(Store.open(), reload(Store.open(), task), 'working');
  process.env.DOLLY_USER = 'tester';

  // what `merge=union` does: both sides' appended lines
  fs.appendFileSync(logOf(task), bob);
  fs.appendFileSync(path.join(task.dir, 'context', 'steps.md'), bobSteps);
  const merged = reload(Store.open(), task);
  assert.equal(merged.meta.steps, 3, 'both offline steps count');
  assert.equal(merged.meta.status, 'working');
  assert.match(logSection(merged), /BOB-WORK/);
  assert.match(logSection(merged), /ALICE-WORK/);
  const ids = stepEntries(task.dir).map((e) => e.id);
  assert.deepEqual([...ids].sort(), ['0001-tester', '0002-alice', '0002-bob']);

  // a bare number resolves against the current user; still ambiguous → listed
  assert.equal(resolveStepId(ids, '2', 'bob'), '0002-bob');
  assert.equal(resolveStepId(ids, '0002', 'alice'), '0002-alice');
  assert.throws(() => resolveStepId(ids, '2', 'carol'), /ambiguous — 0002-alice, 0002-bob/);
  assert.equal(resolveStepId(ids, '1'), '0001-tester');
  assert.equal(planCompaction(merged, { keep: 1, through: '2', user: 'alice' }).through, '0002-alice');
  // and the next step takes a number nobody used
  assert.equal(addStep(Store.open(), reload(Store.open(), task), { summary: 'after', detail: 'n' }), 4);
});

test('a real git merge of two offline branches finishes with no conflict', (t) => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-merge-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const env = {
    ...process.env,
    DOLLY_DIR: path.join(dir, '.dolly'),
    DOLLY_NO_UPDATE_CHECK: '1',
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@e.c',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@e.c',
  };
  const git = (...a) => execFileSync('git', a, { cwd: dir, env, encoding: 'utf8' });
  const dolly = (user, ...a) => execFileSync(process.execPath, [CLI, ...a], { cwd: dir, env: { ...env, DOLLY_USER: user }, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(dir, 'f'), 'x\n');
  const id = JSON.parse(dolly('alice', 'new', 'Shared', '--json')).id;
  dolly('alice', 'step', id, '-m', 'base', '--detail', 'b');
  git('add', '-A');
  git('commit', '-qm', 'base');
  git('checkout', '-qb', 'bob');
  dolly('bob', 'step', id, '-m', 'BOB', '--detail', 'bob body');
  dolly('bob', 'spec', id, '--short', 'BOB-SHORT');
  git('add', '-A');
  git('commit', '-qm', 'bob');
  git('checkout', '-q', 'main');
  dolly('alice', 'step', id, '-m', 'ALICE', '--detail', 'alice body');
  dolly('alice', 'status', id, 'working');
  git('add', '-A');
  git('commit', '-qm', 'alice');
  const merge = spawnSync('git', ['merge', '-q', 'bob', '-m', 'merge'], { cwd: dir, env, encoding: 'utf8' });
  assert.equal(merge.status, 0, `merge stopped: ${merge.stdout}${merge.stderr}`);

  const ctx = dolly('alice', 'context', id, '--brief');
  assert.match(ctx, /BOB-SHORT/);
  assert.match(ctx, /`working`/);
  for (const s of ['BOB', 'ALICE']) assert.match(ctx, new RegExp(`: ${s}\\b`));
  assert.match(ctx, /3 steps/);
  // the next command re-rendered task.md to match the merged log
  process.env.DOLLY_DIR = env.DOLLY_DIR;
  const task = Store.open(dir).resolve(id);
  assert.equal(renderFromLog(task.dir), fs.readFileSync(path.join(task.dir, 'task.md'), 'utf8'));
});

test('v8 migration: a legacy task starts its log losslessly; a custom frontmatter key is refused', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const plain = createTask(store, { title: 'Plain legacy' });
  addStep(store, reload(store, plain), { summary: 'old work', detail: 'old body' });
  const custom = createTask(store, { title: 'Custom key' });
  for (const task of [plain, custom]) fs.rmSync(logOf(task));
  const customFile = path.join(custom.dir, 'task.md');
  fs.writeFileSync(customFile, fs.readFileSync(customFile, 'utf8').replace(/^status: /m, 'priority: high\nstatus: '));
  const before = md(plain);

  const r = migrate(Store.open());
  assert.ok(fs.existsSync(logOf(plain)));
  assert.equal(md(plain), before, 'task.md untouched: it already was the rendering');
  assert.equal(renderFromLog(plain.dir), before);
  assert.equal(fold(readEvents(plain.dir)).meta.steps, 1);
  assert.ok(!fs.existsSync(logOf(custom)), 'refused, left on task.md');
  assert.ok(r.actions.some((a) => /priority, which a render would drop/.test(a.detail)));
  assert.match(fs.readFileSync(path.join(sb.store, '.gitattributes'), 'utf8'), /tasks\/\*\/log\.jsonl merge=union/);

  // after the migration, writes go through the log
  addStep(Store.open(), reload(Store.open(), plain), { summary: 'new work', detail: 'n' });
  assert.equal(readEvents(plain.dir).length, 2);
  assert.match(md(plain), /new work/);
});
