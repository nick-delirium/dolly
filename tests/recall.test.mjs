import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { addPlanQA, startPlan } from '../dist/core/plan.js';
import { setProjectSection } from '../dist/core/project.js';
import {
  editDistance,
  knownStores,
  mentionedBy,
  parseSince,
  recall,
  similarTasks,
  stem,
  tokenize,
  why,
} from '../dist/core/recall.js';
import { recordProject, Store } from '../dist/core/store.js';
import { addStep, createTask, setStatus, updateSpec } from '../dist/core/task.js';
import { sandbox } from './helpers.mjs';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');

function dolly(cwd, args, env = {}) {
  return execFileSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, DOLLY_USER: 'tester', NO_COLOR: '1', ...env },
  });
}

/** a small store with one of everything recall reads */
function seed() {
  const store = Store.open();
  store.init();
  const lock = createTask(store, { title: 'Lock store writes', specShort: 'Parallel writers must not reuse step numbers.' });
  addStep(store, lock, {
    summary: 'Added an exclusive write lock.',
    files: ['src/core/lock.ts', 'src/cli.ts'],
    detail: [
      '## Lock design',
      '',
      'O_EXCL lock file holding the pid; a dead pid is cleared.',
      '',
      '### Decisions',
      '',
      'Chose a lock file over flock: flock is not portable to Windows.',
      '',
      '### Dead ends',
      '',
      'Tried advisory locking first and dropped it.',
    ].join('\n'),
  });
  const auth = createTask(Store.open(), { title: 'Token refresh', specShort: 'Refresh tokens before expiry.' });
  addStep(Store.open(), auth, { summary: 'Refresh runs a minute early; see the lock task.', detail: `Builds on ${lock.meta.id}: refresh reuses its writer.` });
  updateSpec(Store.open(), auth, { full: 'Refresh with a sliding window.', reason: 'first' });
  updateSpec(Store.open(), auth, { full: 'Refresh at a fixed minute before expiry.', reason: 'window was flaky' });
  setStatus(Store.open(), auth, 'done');
  const plan = startPlan(Store.open(), 'Search memory', 'find old decisions');
  addPlanQA(Store.open(), plan, 'Use a database for memory?', 'No: markdown in git stays the source of truth.');
  setProjectSection(Store.open(), 'Invariants', '- Steps are append-only.');
  fs.mkdirSync(path.join(store.root, 'memo'), { recursive: true });
  fs.writeFileSync(path.join(store.root, 'memo', '2026-01-02.md'), '# Memo — 2026-01-02\n\nShipped the quarterly billing export.\n');
  return { lock, auth, plan };
}

/** every hit's line must exist and carry one of the query's words */
function assertHitsLand(res, words) {
  for (const h of res.hits) {
    const lines = fs.readFileSync(h.file, 'utf8').split('\n');
    const line = lines[h.line - 1];
    assert.ok(line !== undefined, `${h.file}:${h.line} exists`);
    const toks = new Set(tokenize(line));
    assert.ok(
      words.some((w) => tokenize(w).some((t) => toks.has(t))) || h.kind === 'step',
      `${h.file}:${h.line} "${line}" carries one of ${words}`,
    );
  }
}

test('tokens keep paths whole and send word forms to one stem', () => {
  const toks = tokenize('Edited src/core/lock.ts and auto-log');
  for (const t of ['src/core/lock.ts', 'lock.ts', 'lock', 'auto-log', 'auto', 'log']) assert.ok(toks.includes(t), t);
  assert.equal(stem('locks'), stem('locked'));
  assert.equal(stem('locking'), stem('lock'));
  assert.equal(stem('logged'), 'log');
  assert.equal(stem('string'), 'string', 'no vowel left means it was never a suffix');
  assert.equal(stem('status'), 'status');
  assert.ok(!tokenize('the and of').length, 'function words are not terms');
});

test('recall ranks the section about it first, and every hit lands on a matching line', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const { lock } = seed();
  const res = recall([Store.open()], 'lock');
  assert.ok(res.hits.length >= 3);
  assert.equal(res.hits[0].task?.meta.id, lock.meta.id);
  assertHitsLand(res, ['lock']);
  assert.ok(res.hits.every((h) => h.file.startsWith(sb.store)));
});

test('a rare word outranks a common one, and a heading outranks a body mention', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  seed();
  const res = recall([Store.open()], 'flock refresh');
  assert.match(res.hits[0].snippet, /flock/, 'rare term carries the score');
  const head = recall([Store.open()], 'design');
  assert.equal(head.hits[0].heading, 'Lock design');
});

test('a superseded spec ranks below the current one', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  seed();
  const res = recall([Store.open()], 'refresh', { kinds: ['spec'] });
  const cur = res.hits.findIndex((h) => /fixed minute/.test(h.snippet));
  const old = res.hits.findIndex((h) => /sliding window/.test(h.snippet));
  assert.ok(cur >= 0 && old >= 0, 'both versions are searchable');
  assert.ok(cur < old);
  assert.match(res.hits[old].label, /superseded/);
});

test('a typo is corrected against the store vocabulary and reported', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  seed();
  const res = recall([Store.open()], 'quartelry');
  assert.deepEqual(res.fuzzy, { quartelry: 'quarterly' });
  assert.equal(res.hits[0].kind, 'memo');
  assert.equal(editDistance('compactoin', 'compaction', 1), 1, 'a transposition is one edit');
});

test('--kind decision keeps only decision sections and planning answers', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  seed();
  const res = recall([Store.open()], 'lock flock database markdown', { kinds: ['decision'] });
  assert.ok(res.hits.length >= 2);
  assert.ok(res.hits.every((h) => h.decision));
  assert.ok(res.hits.some((h) => h.label === 'plan Q&A'));
  assert.ok(res.hits.some((h) => h.heading === 'Decisions'));
  assert.ok(res.hits.some((h) => h.heading === 'Dead ends'));
});

test('filters: kind, status, since, task and limit', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const { lock, auth } = seed();
  const s = Store.open();
  assert.ok(recall([s], 'refresh', { kinds: ['log'] }).hits.every((h) => h.kind === 'log'));
  assert.ok(recall([s], 'refresh lock', { status: 'done' }).hits.every((h) => h.task?.meta.id === auth.meta.id));
  assert.ok(recall([s], 'lock', { taskId: lock.meta.id }).hits.every((h) => h.task?.meta.id === lock.meta.id));
  assert.equal(recall([s], 'lock', { limit: 1 }).hits.length, 1);
  // the memo is dated 2026-01-02; a later bound drops it, an earlier one keeps it
  assert.equal(recall([s], 'billing', { since: '2026-02-01' }).hits.length, 0);
  assert.equal(recall([s], 'billing', { since: '2025-12-01' }).hits.length, 1);
  assert.match(parseSince('30d'), /^\d{4}-/);
  assert.throws(() => parseSince('soon'), /--since/);
  assert.throws(() => recall([s], 'lock', { kinds: ['nope'] }), /unknown --kind nope/);
});

test('backlinks: tasks mentioning an id, never the task itself', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const { lock, auth } = seed();
  // the lock task mentions its own id in its title line; that is not a backlink
  const ms = mentionedBy(Store.open(), lock);
  assert.deepEqual(ms.map((m) => m.task.meta.id), [auth.meta.id]);
  assert.match(ms[0].text, new RegExp(lock.meta.id));
  assert.deepEqual(mentionedBy(Store.open(), auth), []);
  const shown = dolly(sb.dir, ['show', lock.meta.id], { DOLLY_DIR: sb.store });
  assert.match(shown, /Mentioned by/);
  const ctx = dolly(sb.dir, ['context', lock.meta.id], { DOLLY_DIR: sb.store });
  assert.match(ctx, /## Mentioned by other tasks/);
});

test('a new task is warned about one whose notes, not title, cover it', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const { lock } = seed();
  const sim = similarTasks(Store.open(), 'Portable flock replacement');
  assert.equal(sim[0]?.task.meta.id, lock.meta.id);
  const r = spawnSync(process.execPath, [CLI, 'new', 'Portable flock replacement'], {
    cwd: sb.dir,
    encoding: 'utf8',
    env: { ...process.env, DOLLY_DIR: sb.store, DOLLY_USER: 'tester', NO_COLOR: '1' },
  });
  assert.match(r.stderr, new RegExp(`${lock.meta.id} Lock store writes`));
});

test('CLI: text output stays under its cap, --json carries the hits', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  store.init();
  for (let i = 0; i < 40; i++) {
    const task = createTask(Store.open(), { title: `Widget change ${i}` });
    addStep(Store.open(), task, { summary: `widget tweak ${i}`, detail: `## Widget notes\n\n${'the widget needs care, '.repeat(20)}` });
  }
  const text = dolly(sb.dir, ['recall', 'widget'], { DOLLY_DIR: sb.store });
  assert.ok(Buffer.byteLength(text) <= 3000, `${Buffer.byteLength(text)} bytes`);
  assert.match(text, /more hidden|top \d+/);
  const json = JSON.parse(dolly(sb.dir, ['recall', 'widget', '--json'], { DOLLY_DIR: sb.store }));
  assert.ok(json.hits.length > 8 && json.hits.length <= 100);
  assert.ok(json.total >= json.hits.length);
  for (const k of ['task', 'kind', 'path', 'line', 'snippet']) assert.ok(k in json.hits[0], k);
  assert.match(dolly(sb.dir, ['recall', 'nothingmatchesthis'], { DOLLY_DIR: sb.store }), /nothing in the store/);
});

test('--all-projects searches every known store and skips dead entries', (t) => {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-recall-home-')));
  const prev = process.env.DOLLY_HOME;
  process.env.DOLLY_HOME = home;
  t.after(() => {
    process.env.DOLLY_HOME = prev;
    fs.rmSync(home, { recursive: true, force: true });
  });
  const mk = (name, title) => {
    const proj = path.join(home, name);
    fs.mkdirSync(proj, { recursive: true });
    const store = new Store({ root: path.join(proj, '.dolly'), project: proj, kind: 'repo' });
    store.init();
    createTask(store, { title, specShort: 'zebra crossing' });
    recordProject(proj, { store: store.root, local: true });
    return store;
  };
  const a = mk('alpha', 'Alpha zebra');
  mk('beta', 'Beta zebra');
  recordProject(path.join(home, 'gone'), { store: path.join(home, 'gone', '.dolly'), local: true });

  const { stores, skipped } = knownStores(a);
  assert.equal(stores.length, 2);
  assert.equal(skipped.length, 1, 'the deleted checkout is skipped, not fatal');
  const res = recall(stores, 'zebra');
  assert.deepEqual(new Set(res.hits.map((h) => path.basename(h.store.project))), new Set(['alpha', 'beta']));

  const out = dolly(path.join(home, 'alpha'), ['recall', 'zebra', '--all-projects'], { DOLLY_HOME: home, DOLLY_DIR: '' });
  assert.match(out, /\[alpha\]/);
  assert.match(out, /\[beta\]/);
});

test('why: the steps that recorded a file, and commits mapped by trailer or id', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const { lock } = seed();
  const git = (...args) => execFileSync('git', args, { cwd: sb.dir, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'T');
  fs.mkdirSync(path.join(sb.dir, 'src', 'core'), { recursive: true });
  fs.writeFileSync(path.join(sb.dir, 'src', 'core', 'lock.ts'), 'export {};\n');
  git('add', 'src');
  git('commit', '-q', '-m', 'feat: lock file', '-m', `Dolly-Task: ${lock.meta.id}`);
  fs.appendFileSync(path.join(sb.dir, 'src', 'core', 'lock.ts'), '// more\n');
  git('commit', '-q', '-am', 'chore: untracked change');

  // an env-pinned store takes its project from the cwd; this test's repo is sb.dir
  const w = why(Store.open(sb.dir), 'src/core/lock.ts');
  assert.deepEqual(w.touched.map((x) => x.task.meta.id), [lock.meta.id]);
  assert.match(w.touched[0].entries[0].text, /exclusive write lock/);
  assert.equal(w.commits.length, 2);
  assert.deepEqual(w.commits.find((c) => c.subject === 'feat: lock file').tasks, [lock.meta.id]);
  assert.deepEqual(w.commits.find((c) => c.subject === 'chore: untracked change').tasks, []);
  const out = dolly(sb.dir, ['why', './src/core/lock.ts'], { DOLLY_DIR: sb.store });
  assert.match(out, /Changed by 1 task/);
  assert.match(out, new RegExp(`feat: lock file → ${lock.meta.id}`));
  assert.match(dolly(sb.dir, ['why', 'nope.ts'], { DOLLY_DIR: sb.store }), /no recorded history/);
});

test('dolly_recall answers over MCP', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  seed();
  const r = spawnSync(process.execPath, [CLI, 'mcp'], {
    cwd: sb.dir,
    input: `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'dolly_recall', arguments: { query: 'flock', kind: ['decision'] } } })}\n`,
    encoding: 'utf8',
    env: { ...process.env, DOLLY_DIR: sb.store, DOLLY_USER: 'tester', NO_COLOR: '1' },
  });
  const reply = JSON.parse(r.stdout.trim().split('\n').pop());
  assert.match(reply.result.content[0].text, /flock is not portable/);
});

test('recall over 1000 tasks finishes well inside two seconds', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  store.init();
  const words = ['parser', 'cache', 'token', 'queue', 'render', 'schema', 'retry', 'socket', 'index', 'quota'];
  const proto = createTask(store, { title: 'Prototype task' });
  for (let i = 0; i < 6; i++) {
    addStep(Store.open(), proto, {
      summary: `step ${i} touched the ${words[i]}`,
      files: [`src/${words[i]}.ts`],
      detail: `## Notes ${i}\n\n${Array.from({ length: 60 }, (_, k) => `${words[(i + k) % 10]} line ${k} of prose.`).join('\n')}`,
    });
  }
  const tasksDir = path.dirname(proto.dir);
  for (let n = 0; n < 999; n++) {
    const id = `p${String(n).padStart(7, '0')}`;
    const dest = path.join(tasksDir, `${id}-copy`);
    fs.cpSync(proto.dir, dest, { recursive: true });
    const file = path.join(dest, 'task.md');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^id: .*$/m, `id: ${id}`).replace(/^slug: .*$/m, 'slug: copy'));
  }
  const t0 = Date.now();
  // the CLI's default limit: snippets are only built for hits that are shown
  const res = recall([Store.open()], 'retry socket', { limit: 8 });
  const ms = Date.now() - t0;
  assert.ok(res.total > 100);
  assert.ok(ms < 2000, `${ms}ms`);
});
