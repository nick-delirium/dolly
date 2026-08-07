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
  overlappingTasks,
  recentlyFinished,
  relatedByFiles,
  relatedToTask,
} from '../dist/core/related.js';
import { Store } from '../dist/core/store.js';
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
