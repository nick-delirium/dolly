import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { archiveTask, housekeep, restoreTask } from '../dist/core/housekeep.js';
import { Store } from '../dist/core/store.js';
import { listBlocks } from '../dist/core/md.js';
import {
  addStep,
  createTask,
  logSection,
  reload,
  setStatus,
  specHistory,
  stepEntries,
  updateSpec,
} from '../dist/core/task.js';
import { ageTask, daysAgo, sandbox } from './helpers.mjs';

test('dry run reports without touching anything', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Old done thing' });
  setStatus(store, task, 'done');
  ageTask(task.dir, daysAgo(40));

  const report = housekeep(Store.open(), { dryRun: true });
  assert.equal(report.actions.length, 1);
  assert.equal(report.actions[0].kind, 'archive');
  assert.ok(fs.existsSync(task.dir), 'dry run must not move the task');
});

test('done tasks archive by month and can be restored', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Old done thing' });
  setStatus(store, task, 'done');
  ageTask(task.dir, daysAgo(40));

  housekeep(Store.open());
  assert.equal(fs.existsSync(task.dir), false);

  const archived = Store.open().loadTasks(true).find((x) => x.archived);
  assert.ok(archived, 'task should be under archive/');
  assert.match(archived.rel, /^archive\/\d{4}-\d{2}\//);
  assert.ok(archived.meta.archived);
  assert.equal(Store.open().loadTasks(false).length, 0);

  const back = restoreTask(Store.open(), archived);
  assert.equal(back.archived, false);
  assert.equal(back.meta.archived, undefined);
  assert.match(logSection(back), /restored/);
  assert.equal(Store.open().loadTasks(false).length, 1);
});

test('unfinished tasks are flagged stale, not archived', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Forgotten work', status: 'working' });
  ageTask(task.dir, daysAgo(90));

  housekeep(Store.open());
  const fresh = Store.open().resolve('1');
  assert.equal(fresh.meta.stale, true);
  assert.equal(fresh.archived, false);

  // any new activity clears the flag
  addStep(Store.open(), fresh, { summary: 'Back on it.' });
  assert.equal(Store.open().resolve('1').meta.stale, undefined);
});

test('pruning drops old step entries but keeps every summary', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Chatty task' });
  for (let i = 1; i <= 4; i++) {
    addStep(Store.open(), reload(store, task), {
      summary: `step ${i} summary`,
      detail: `full context ${i}`,
    });
  }
  const stepsPath = path.join(task.dir, 'context', 'steps.md');
  assert.equal(stepEntries(task.dir).length, 4);

  const s = Store.open();
  s.saveConfig({ ...s.config, housekeep: { ...s.config.housekeep, keepFullStepsPerTask: 2 } });

  const report = housekeep(Store.open());
  assert.ok(report.actions.some((a) => a.kind === 'prune-steps'));

  const raw = fs.readFileSync(stepsPath, 'utf8');
  assert.deepEqual(listBlocks(raw, 'step'), ['0003', '0004']);
  assert.doesNotMatch(raw, /full context 1/);
  assert.match(raw, /full context 4/);
  // the surviving entries keep their markers intact after two removals
  assert.equal(raw.match(/<!-- dolly:step 0003 -->/g).length, 1);
  assert.equal(raw.match(/<!-- \/dolly:step 0004 -->/g).length, 1);

  const log = logSection(Store.open().resolve('1'));
  for (let i = 1; i <= 4; i++) assert.match(log, new RegExp(`step ${i} summary`));
  assert.match(log, /full: _pruned by housekeeping_/);
  assert.match(log, /full: `steps\.md#0004`/);
});

test('spec history is trimmed only when keepSpecVersions is set', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Many specs', specFull: '# v1' });
  for (const v of [2, 3, 4]) updateSpec(Store.open(), reload(store, task), { full: `# v${v}` });
  assert.equal(specHistory(Store.open().resolve('1')).match(/## v\d+ —/g).length, 3);

  housekeep(Store.open());
  assert.equal(specHistory(Store.open().resolve('1')).match(/## v\d+ —/g).length, 3);

  const s = Store.open();
  s.saveConfig({ ...s.config, housekeep: { ...s.config.housekeep, keepSpecVersions: 1 } });
  const report = housekeep(Store.open());
  assert.ok(report.actions.some((a) => a.kind === 'prune-specs'));
  const hist = specHistory(Store.open().resolve('1'));
  assert.deepEqual(hist.match(/## v\d+ —/g), ['## v3 —'], 'keeps the newest superseded version');
});

test('archived tasks are deleted only when configured', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Ancient' });
  setStatus(store, task, 'done');
  const archived = archiveTask(Store.open(), reload(store, task));
  ageTask(archived.dir, daysAgo(400));

  housekeep(Store.open());
  assert.ok(fs.existsSync(archived.dir), 'default config keeps archives forever');

  const s = Store.open();
  s.saveConfig({
    ...s.config,
    housekeep: { ...s.config.housekeep, deleteArchivedAfterDays: 365 },
  });
  const report = housekeep(Store.open());
  assert.ok(report.actions.some((a) => a.kind === 'delete-archived'));
  assert.equal(fs.existsSync(archived.dir), false);
});

test('auto housekeeping is throttled by the marker file', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  createTask(store, { title: 'Anything' });
  housekeep(Store.open());
  const marker = path.join(sb.store, '.housekeep.json');
  assert.ok(fs.existsSync(marker));
  assert.ok(JSON.parse(fs.readFileSync(marker, 'utf8')).lastRun);
});
