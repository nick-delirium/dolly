import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Store, currentTask } from '../dist/core/store.js';
import { listBlocks } from '../dist/core/md.js';
import {
  addStep,
  createTask,
  criteria,
  fullSpec,
  logSection,
  recentStepDetails,
  reload,
  retitle,
  setStatus,
  shortSpec,
  specHistory,
  stepEntries,
  updateSpec,
} from '../dist/core/task.js';
import { sandbox } from './helpers.mjs';

test('createTask lays out the store and stamps identity', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, {
    title: 'Add OAuth login',
    specShort: 'GitHub OAuth, session cookie 7d.',
    specFull: '# OAuth\n\nAuthorization code flow.',
    criteria: ['login works', 'logout clears session'],
    tags: ['auth'],
  });

  assert.equal(task.meta.id, '0001');
  assert.equal(task.meta.slug, 'add-oauth-login');
  assert.equal(task.meta.status, 'todo');
  assert.equal(task.meta.owner, 'tester');
  assert.equal(task.meta.spec_version, 1);
  assert.deepEqual(task.meta.tags, ['auth']);

  assert.ok(fs.existsSync(path.join(task.dir, 'task.md')));
  assert.ok(fs.existsSync(path.join(task.dir, 'context', 'spec.md')));
  assert.ok(fs.existsSync(path.join(task.dir, 'context', 'steps.md')));
  // one file per concern — no per-version or per-step files
  assert.equal(fs.readdirSync(path.join(task.dir, 'context')).sort().join(','), 'spec.md,steps.md');

  const fresh = reload(store, task);
  assert.equal(shortSpec(fresh), 'GitHub OAuth, session cookie 7d.');
  assert.match(criteria(fresh), /- \[ \] login works/);
  assert.match(fullSpec(fresh), /Authorization code flow/);
});

test('ids increment and slugs stay unique per title', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  createTask(store, { title: 'First thing' });
  const second = createTask(store, { title: 'Second thing' });
  assert.equal(second.meta.id, '0002');
  assert.equal(Store.open().loadTasks().length, 2);
});

test('addStep writes both tiers and bumps the counter', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Ship thing' });

  const n = addStep(store, task, {
    summary: 'Wired the callback route.',
    files: ['src/a.ts', 'src/b.ts'],
    detail: 'Chose auth-code flow. Implicit blocked by CSP.',
  });
  assert.equal(n, 1);
  assert.equal(task.meta.steps, 1);

  const steps = fs.readFileSync(path.join(task.dir, 'context', 'steps.md'), 'utf8');
  assert.match(steps, /<!-- dolly:step 0001 -->/);
  assert.match(steps, /## 0001 · .* · @tester/);
  assert.match(steps, /Implicit blocked by CSP/);

  const log = logSection(reload(store, task));
  assert.match(log, /^- `[\d-]+ [\d:]+Z` @tester: Wired the callback route\.$/m);
  assert.match(log, /files: `src\/a\.ts`, `src\/b\.ts` · full: `steps\.md#0001`/);
  assert.doesNotMatch(log, /_no steps yet_/);

  // a summary-only step adds no entry to steps.md and no `full:` trailer
  addStep(store, task, { summary: 'Tidied imports.' });
  assert.equal(task.meta.steps, 2);
  const steps2 = fs.readFileSync(path.join(task.dir, 'context', 'steps.md'), 'utf8');
  assert.deepEqual(listBlocks(steps2, 'step'), ['0001']);
  const log2 = logSection(reload(store, task));
  assert.match(log2, /@tester: Tidied imports\.$/m);
  assert.doesNotMatch(log2, /full: _none_/);
});

test('step entries are readable back in order, oldest first', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Ordered' });
  for (const i of [1, 2, 3]) {
    addStep(store, task, { summary: `s${i}`, detail: `detail ${i}` });
  }
  const all = stepEntries(task.dir);
  assert.deepEqual(all.map((e) => e.id), ['0001', '0002', '0003']);
  assert.match(all[0].text, /detail 1/);
  assert.deepEqual(recentStepDetails(task, 2).map((e) => e.id), ['0002', '0003']);
  assert.deepEqual(recentStepDetails(task, 0).map((e) => e.id), ['0001', '0002', '0003']);
});

test('updateSpec versions the full spec but only replaces the short one', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, {
    title: 'Versioned',
    specShort: 'v1 short',
    specFull: '# v1 full',
  });

  const v = updateSpec(store, task, {
    short: 'v2 short',
    full: '# v2 full',
    criteria: ['new criterion'],
    reason: 'security review demanded PKCE',
  });
  assert.equal(v, 2);

  // one file holds the current spec and its whole history
  assert.deepEqual(fs.readdirSync(path.join(task.dir, 'context')).sort(), ['spec.md', 'steps.md']);
  const fresh = reload(store, task);
  assert.match(fullSpec(fresh), /v2 full/);
  assert.doesNotMatch(fullSpec(fresh), /v1 full/);

  const hist = specHistory(fresh);
  assert.match(hist, /## v1 — /);
  assert.match(hist, /> superseded by v2: security review demanded PKCE/);
  assert.match(hist, /v1 full/);

  assert.equal(shortSpec(fresh), 'v2 short');
  assert.match(criteria(fresh), /- \[ \] new criterion/);
  assert.match(logSection(fresh), /spec → v2\. security review demanded PKCE/);

  // short-only edit does not bump the version
  assert.equal(updateSpec(store, fresh, { short: 'v2 short, reworded' }), 2);
});

test('setStatus validates against config and logs the transition', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Statuses' });

  setStatus(store, task, 'working');
  setStatus(store, task, 'validating', 'check the auth suite');
  assert.equal(task.meta.status, 'validating');
  const log = logSection(reload(store, task));
  assert.match(log, /@tester: status todo → working\.$/m);
  assert.match(log, /@tester: status working → validating\. check the auth suite$/m);

  assert.throws(() => setStatus(store, task, 'nonsense'), /unknown status/);
});

test('refs resolve by id, padded id, slug, substring and current', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  createTask(store, { title: 'Alpha feature' });
  const beta = createTask(store, { title: 'Beta feature' });
  setStatus(store, beta, 'working');

  const s = Store.open();
  assert.equal(s.resolve('1').meta.slug, 'alpha-feature');
  assert.equal(s.resolve('0001').meta.slug, 'alpha-feature');
  assert.equal(s.resolve('beta-feature').meta.id, '0002');
  assert.equal(s.resolve('alpha').meta.id, '0001');
  assert.equal(s.resolve('current').meta.id, '0002');
  assert.equal(s.resolve('@').meta.id, '0002');
  assert.throws(() => s.resolve('feature'), /ambiguous/);
  assert.throws(() => s.resolve('nope'), /no task matching/);
});

test('current task prefers working, then validating, then planning', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const planning = createTask(store, { title: 'Planning one', status: 'planning' });
  const validating = createTask(store, { title: 'Validating one', status: 'validating' });
  const cfg = Store.open().config;

  assert.equal(currentTask(Store.open().loadTasks(), cfg).meta.id, validating.meta.id);
  const working = createTask(store, { title: 'Working one', status: 'working' });
  assert.equal(currentTask(Store.open().loadTasks(), cfg).meta.id, working.meta.id);

  setStatus(store, working, 'done');
  setStatus(store, validating, 'done');
  assert.equal(currentTask(Store.open().loadTasks(), cfg).meta.id, planning.meta.id);
});

test('collaborators accumulate across users', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Shared work' });
  assert.deepEqual(task.meta.collaborators, ['tester']);

  process.env.DOLLY_USER = 'alice';
  const asAlice = Store.open();
  addStep(asAlice, reload(asAlice, task), { summary: 'Alice did a thing.' });

  const after = Store.open().resolve('1');
  assert.deepEqual(after.meta.collaborators, ['tester', 'alice']);
  process.env.DOLLY_USER = 'tester';
});

test('history accumulates newest-first across several spec versions', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Many versions', specFull: '# v1' });
  updateSpec(store, task, { full: '# v2', reason: 'reason two' });
  updateSpec(store, task, { full: '# v3', reason: 'reason three' });

  assert.equal(task.meta.spec_version, 3);
  const fresh = reload(store, task);
  assert.match(fullSpec(fresh), /# v3/);
  const hist = specHistory(fresh);
  assert.ok(hist.indexOf('## v2 —') < hist.indexOf('## v1 —'), 'newest superseded version first');
  assert.match(hist, /> superseded by v3: reason three/);
  assert.match(hist, /> superseded by v2: reason two/);
});

test('the live conversation is recorded on every touch, for dolly continue', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  t.after(() => delete process.env.DOLLY_SESSION_ID);

  process.env.DOLLY_SESSION_ID = 'sess-aaa';
  const store = Store.open();
  const task = createTask(store, { title: 'Session tracked' });
  assert.deepEqual(task.meta.sessions, ['sess-aaa']);

  // a second step in the same session must not duplicate the id
  addStep(store, task, { summary: 'more work' });
  assert.deepEqual(Store.open().resolve('1').meta.sessions, ['sess-aaa']);

  // resuming the task tomorrow in a new conversation appends
  process.env.DOLLY_SESSION_ID = 'sess-bbb';
  addStep(Store.open(), reload(store, task), { summary: 'next day' });
  assert.deepEqual(Store.open().resolve('1').meta.sessions, ['sess-aaa', 'sess-bbb']);

  // no session id (a plain shell) leaves the list untouched
  delete process.env.DOLLY_SESSION_ID;
  setStatus(Store.open(), Store.open().resolve('1'), 'working');
  assert.deepEqual(Store.open().resolve('1').meta.sessions, ['sess-aaa', 'sess-bbb']);
});

test('retitle renames the task, its heading and its directory', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Old name here' });
  addStep(store, task, { summary: 'some work', detail: 'full context' });

  const moved = retitle(Store.open(), reload(store, task), 'Brand new name');
  assert.equal(moved.meta.title, 'Brand new name');
  assert.equal(moved.meta.slug, 'brand-new-name');
  assert.equal(path.basename(moved.dir), '0001-brand-new-name');
  assert.equal(fs.existsSync(task.dir), false, 'old directory gone');

  // the id is stable, and nothing about the history is lost
  const fresh = Store.open().resolve('1');
  assert.equal(fresh.meta.id, '0001');
  assert.match(fresh.body, /^# 0001 · Brand new name$/m);
  assert.match(logSection(fresh), /retitled: "Old name here" → "Brand new name"/);
  assert.match(logSection(fresh), /some work/);
  assert.deepEqual(stepEntries(fresh.dir).map((e) => e.id), ['0001']);

  // resolving by the new slug works, and a no-op retitle is harmless
  assert.equal(Store.open().resolve('brand-new-name').meta.id, '0001');
  assert.equal(retitle(Store.open(), fresh, 'Brand new name').meta.slug, 'brand-new-name');
  assert.throws(() => retitle(Store.open(), fresh, '   '), /needs a title/);
});
