import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  codeMapLine,
  detectCodeMaps,
  ensureProject,
  projectDigest,
  projectStatus,
  setProjectSection,
} from '../dist/core/project.js';
import {
  filesOfTask,
  latestOutcome,
  parseLog,
  overlappingTasks,
  recentlyFinished,
  relatedByFiles,
  relatedToTask,
} from '../dist/core/related.js';
import { Store, sharedUserLeak } from '../dist/core/store.js';
import { migrate } from '../dist/migrate.js';
import { addStep, createTask, setStatus } from '../dist/core/task.js';
import { sandbox } from './helpers.mjs';

test('the project brief tracks which sections are still unanswered', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  store.init();

  assert.equal(projectStatus(store).exists, false);
  ensureProject(store);

  const seeded = projectStatus(store);
  assert.equal(seeded.exists, true);
  assert.deepEqual(seeded.filled, [], 'a fresh brief counts as entirely unfilled');
  assert.ok(seeded.missing.includes('Invariants'));
  assert.equal(projectDigest(store), '', 'nothing to inject while every section is _TBD_');

  setProjectSection(store, 'Conventions', '- errors bubble, never swallowed\n- no default exports');
  const after = projectStatus(store);
  assert.deepEqual(after.filled, ['Conventions']);

  const digest = projectDigest(store);
  assert.match(digest, /### Conventions/);
  assert.match(digest, /no default exports/);
  assert.doesNotMatch(digest, /_TBD_/, 'unfilled sections are not injected');
  assert.doesNotMatch(digest, /<!-- ask:/, 'interview prompts never leak into context');
});

test('code maps are detected, never built', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  assert.deepEqual(detectCodeMaps(sb.dir), []);
  assert.equal(codeMapLine(sb.dir), '');

  fs.mkdirSync(path.join(sb.dir, '.codegraph'), { recursive: true });
  const found = detectCodeMaps(sb.dir);
  assert.deepEqual(found.map((m) => m.name), ['CodeGraph']);
  assert.match(codeMapLine(sb.dir), /codegraph explore/);
});

test('tasks are linked by the files their steps touched', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();

  const auth = createTask(store, { title: 'Add OAuth login' });
  addStep(store, auth, {
    summary: 'Token refresh landed behind a flag.',
    files: ['src/auth/token.ts', 'src/auth/index.ts'],
    detail: 'chose refresh-at-6d',
  });

  const rate = createTask(Store.open(), { title: 'Rate limit the API' });
  addStep(Store.open(), rate, {
    summary: 'Bucket per token.',
    files: ['src/auth/token.ts', 'src/api/limit.ts'],
    detail: 'reused the token parser',
  });

  const unrelated = createTask(Store.open(), { title: 'Docs pass' });
  addStep(Store.open(), unrelated, { summary: 'typos', files: ['README.md'], detail: 'x' });

  assert.deepEqual(filesOfTask(Store.open().resolve('1')), ['src/auth/index.ts', 'src/auth/token.ts']);

  const related = relatedToTask(Store.open(), Store.open().resolve('1'));
  assert.deepEqual(related.map((r) => r.task.meta.id), ['0002'], 'only the task sharing a file');
  assert.deepEqual(related[0].shared, ['src/auth/token.ts']);
  assert.match(related[0].outcome, /Bucket per token/, 'and what it concluded');

  // a task never counts as related to itself
  assert.equal(relatedToTask(Store.open(), Store.open().resolve('3')).length, 0);

  // ad-hoc lookup before a task exists, ranked by overlap
  const byFiles = relatedByFiles(Store.open(), ['src/auth/token.ts', 'src/auth/index.ts']);
  assert.deepEqual(byFiles.map((r) => r.task.meta.id), ['0001', '0002']);
  assert.deepEqual(byFiles[0].shared.length, 2);
});

test('overlapping titles are flagged so a new task does not duplicate one', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  createTask(store, { title: 'Add replay country filter' });
  createTask(Store.open(), { title: 'Upgrade the build pipeline' });

  const hits = overlappingTasks(Store.open(), 'Add replay browser filter');
  assert.deepEqual(hits.map((h) => h.task.meta.id), ['0001']);
  assert.ok(hits[0].words.includes('replay') && hits[0].words.includes('filter'));

  // stopwords alone never trigger it
  assert.deepEqual(overlappingTasks(Store.open(), 'Add and fix the it'), []);
});

test('recently finished work is surfaced newest first', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const a = createTask(store, { title: 'First' });
  const b = createTask(Store.open(), { title: 'Second' });
  createTask(Store.open(), { title: 'Still todo' });

  setStatus(Store.open(), a, 'done');
  setStatus(Store.open(), b, 'validating');

  const recent = recentlyFinished(Store.open(), 5);
  assert.deepEqual(recent.map((x) => x.meta.id), ['0002', '0001'], 'newest first, todo excluded');
  assert.match(latestOutcome(recent[0]), /status todo → validating/);
});

/* ------------------- identity must never be shared (fix 1) ----------------- */

test('a user in the shared config is ignored, and migrate moves it out', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  store.init();

  // simulate the shipped bug: `user` committed in config.json
  const cfgPath = path.join(sb.store, 'config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  cfg.user = 'someone-else';
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf8');

  assert.equal(sharedUserLeak(sb.store), 'someone-else');
  assert.equal(Store.open().config.user, null, 'a shared user is not honoured');

  const report = migrate(Store.open());
  assert.ok(report.actions.some((a) => a.kind === 'config-split'));
  assert.equal(sharedUserLeak(sb.store), null, 'removed from the shared file');
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(sb.store, 'local.json'), 'utf8')).user,
    'someone-else',
    'preserved in the gitignored local file',
  );
  assert.equal(Store.open().config.user, 'someone-else', 'and honoured from there');
  assert.equal(migrate(Store.open()).actions.length, 0, 'idempotent');
});

test('the store gitignores its per-machine files', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  const ignore = fs.readFileSync(path.join(sb.store, '.gitignore'), 'utf8').split('\n');
  for (const line of ['local.json', '.housekeep.json']) assert.ok(ignore.includes(line), line);
});

test('migrate refreshes the gitignore, or moving identity to local.json is moot', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  // an older store whose .gitignore predates local.json
  const ignore = path.join(sb.store, '.gitignore');
  fs.writeFileSync(ignore, '.housekeep.json\n', 'utf8');

  migrate(Store.open());
  assert.ok(
    fs.readFileSync(ignore, 'utf8').split('\n').includes('local.json'),
    'local.json must be ignored, or the identity gets committed again',
  );
});

test('saveConfig never writes identity back into the shared file', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  store.init();
  store.saveLocal({ user: 'me' });

  const reopened = Store.open();
  assert.equal(reopened.config.user, 'me');
  reopened.saveConfig({ ...reopened.config, statuses: [...reopened.config.statuses] });
  assert.equal(sharedUserLeak(sb.store), null, 'user stayed out of config.json');
  assert.equal(Store.open().config.user, 'me', 'and is still read from local.json');
});

/* ------------- the log is the complete record (fixes 5 + 6) ---------------- */

test('files and outcomes come from the log, not just detailed steps', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Mixed steps' });

  // a step WITHOUT detail writes no steps.md entry — its files live only in the log
  addStep(Store.open(), Store.open().resolve('1'), {
    summary: 'Tightened the parser.',
    files: ['src/parse.ts'],
  });
  addStep(Store.open(), Store.open().resolve('1'), {
    summary: 'Added the index.',
    files: ['src/index.ts'],
    detail: 'composite index on (a, b)',
  });
  setStatus(Store.open(), Store.open().resolve('1'), 'validating', 'check the suite');

  const fresh = Store.open().resolve('1');
  assert.deepEqual(filesOfTask(fresh), ['src/index.ts', 'src/parse.ts'], 'both, not just the detailed one');

  const log = parseLog(fresh);
  assert.deepEqual(log.map((e) => e.kind), ['step', 'step', 'status']);
  assert.deepEqual(log[0].files, ['src/parse.ts']);

  // the newest LINE is a status move; the outcome must be the newest STEP
  assert.equal(latestOutcome(fresh), 'Added the index.');
});

test('a task whose only entries are status moves says so', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'No steps yet' });
  setStatus(Store.open(), Store.open().resolve('1'), 'working');
  assert.match(latestOutcome(Store.open().resolve('1')), /^\(no step logged yet\)/);
});
