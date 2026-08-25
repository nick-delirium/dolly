import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  globalStoreFor,
  indexFile,
  forgetProject,
  linkedStore,
  locateStore,
  moveStore,
  projectEntry,
  readProjectIndex,
  recordProject,
} from '../dist/core/store.js';

/** an isolated ~/.dolly plus a project directory, with no DOLLY_DIR in play */
function ground(t, { git = false } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-home-'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-proj-'));
  const prevHome = process.env.DOLLY_HOME;
  const prevDir = process.env.DOLLY_DIR;
  process.env.DOLLY_HOME = home;
  delete process.env.DOLLY_DIR;
  if (git) execFileSync('git', ['init', '-q'], { cwd: project });
  t.after(() => {
    if (prevHome === undefined) delete process.env.DOLLY_HOME;
    else process.env.DOLLY_HOME = prevHome;
    if (prevDir === undefined) delete process.env.DOLLY_DIR;
    else process.env.DOLLY_DIR = prevDir;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(project, { recursive: true, force: true });
  });
  // realpath: macOS puts temp dirs behind /var -> /private/var
  return { home: fs.realpathSync(home), project: fs.realpathSync(project) };
}

/** the minimum that makes a directory look like a store */
function fakeStore(root) {
  fs.mkdirSync(path.join(root, 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(root, 'config.json'), '{"version":4}\n');
  return root;
}

test('a linked project resolves to its out-of-repo store, from any depth', (t) => {
  const g = ground(t);
  const root = fakeStore(globalStoreFor(g.project, g.home));
  recordProject(g.project, { store: root, local: false });

  assert.equal(linkedStore(g.project), root);

  const top = locateStore(g.project);
  assert.equal(top.kind, 'linked');
  assert.equal(top.root, root);
  assert.equal(top.project, g.project);

  const nested = path.join(g.project, 'src', 'deep');
  fs.mkdirSync(nested, { recursive: true });
  const below = locateStore(nested);
  assert.equal(below.root, root);
  assert.equal(below.project, g.project);
});

test('nothing is written into the linked project itself', (t) => {
  const g = ground(t);
  recordProject(g.project, { store: fakeStore(globalStoreFor(g.project, g.home)), local: false });
  assert.deepEqual(fs.readdirSync(g.project), []);
  assert.ok(fs.existsSync(indexFile(g.home)));
});

test('a real .dolly/ beats an index entry for the same directory', (t) => {
  const g = ground(t);
  recordProject(g.project, { store: fakeStore(globalStoreFor(g.project, g.home)), local: false });
  const inRepo = fakeStore(path.join(g.project, '.dolly'));

  const loc = locateStore(g.project);
  assert.equal(loc.kind, 'found');
  assert.equal(loc.root, inRepo);
});

test('DOLLY_DIR still wins over everything', (t) => {
  const g = ground(t);
  recordProject(g.project, { store: fakeStore(globalStoreFor(g.project, g.home)), local: false });
  const pinned = path.join(g.home, 'pinned', '.dolly');
  process.env.DOLLY_DIR = pinned;
  try {
    const loc = locateStore(g.project);
    assert.equal(loc.kind, 'env');
    assert.equal(loc.root, pinned);
  } finally {
    delete process.env.DOLLY_DIR;
  }
});

test('an entry pointing at a store that is gone falls through, it does not throw', (t) => {
  const g = ground(t, { git: true });
  const root = fakeStore(globalStoreFor(g.project, g.home));
  recordProject(g.project, { store: root, local: false });
  fs.rmSync(root, { recursive: true, force: true });

  assert.equal(linkedStore(g.project), null);
  const loc = locateStore(g.project);
  assert.equal(loc.kind, 'repo');
  assert.equal(loc.root, path.join(g.project, '.dolly'));
});

test('unlink restores the ordinary lookup, and re-linking never duplicates', (t) => {
  const g = ground(t, { git: true });
  const root = fakeStore(globalStoreFor(g.project, g.home));
  recordProject(g.project, { store: root, local: false });
  recordProject(g.project, { store: root, local: false });
  assert.equal(Object.keys(readProjectIndex(indexFile(g.home))).length, 1);

  forgetProject(g.project);
  assert.equal(linkedStore(g.project), null);
  assert.equal(locateStore(g.project).kind, 'repo');
  forgetProject(g.project); // idempotent
});

test('two projects get two entries and two stores', (t) => {
  const g = ground(t);
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-proj2-'));
  t.after(() => fs.rmSync(other, { recursive: true, force: true }));
  const a = fakeStore(globalStoreFor(g.project, g.home));
  const b = fakeStore(globalStoreFor(fs.realpathSync(other), g.home));
  assert.notEqual(a, b);
  recordProject(g.project, { store: a, local: false });
  recordProject(other, { store: b, local: false });
  assert.equal(Object.keys(readProjectIndex(indexFile(g.home))).length, 2);
  assert.equal(linkedStore(g.project), a);
  assert.equal(linkedStore(other), b);
});

/* --------------------------------- moving --------------------------------- */

const CLI = path.resolve(import.meta.dirname, '..', 'dist', 'cli.js');

function dolly(cwd, args, env = {}) {
  return execFileSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, DOLLY_USER: 'tester', NO_COLOR: '1', ...env },
  });
}

test('moving a store carries every task across and leaves one store behind', (t) => {
  const g = ground(t, { git: true });
  const from = path.join(g.project, '.dolly');
  dolly(g.project, ['init', '--yes', '--no-agents'], { DOLLY_DIR: from });
  dolly(g.project, ['new', 'first task', '--short', 'a'], { DOLLY_DIR: from });
  const taskId = fs.readdirSync(path.join(from, 'tasks'))[0].split('-')[0];
  dolly(g.project, ['step', taskId, '-m', 'did a thing', '--files', 'x.ts'], { DOLLY_DIR: from });
  const before = fs.readdirSync(path.join(from, 'tasks'));
  const task = fs.readFileSync(path.join(from, 'tasks', before[0], 'task.md'), 'utf8');

  const to = globalStoreFor(g.project, g.home);
  moveStore(from, to);

  assert.equal(fs.existsSync(from), false);
  assert.deepEqual(fs.readdirSync(path.join(to, 'tasks')), before);
  assert.equal(fs.readFileSync(path.join(to, 'tasks', before[0], 'task.md'), 'utf8'), task);
  assert.match(task, /did a thing/, 'the step being carried across was logged in the first place');

  recordProject(g.project, { store: to, local: false });
  assert.equal(locateStore(g.project).root, to);
});

test('a move into a non-empty directory is refused, both sides untouched', (t) => {
  const g = ground(t);
  const from = fakeStore(path.join(g.project, '.dolly'));
  fs.mkdirSync(path.join(from, 'tasks', '0001-x'), { recursive: true });
  const to = globalStoreFor(g.project, g.home);
  fs.mkdirSync(to, { recursive: true });
  fs.writeFileSync(path.join(to, 'occupied.txt'), 'mine\n');

  assert.throws(() => moveStore(from, to), /not empty/);
  assert.ok(fs.existsSync(path.join(from, 'tasks', '0001-x')));
  assert.deepEqual(fs.readdirSync(to), ['occupied.txt']);
});

test('moving a store onto itself is a no-op, not a delete', (t) => {
  const g = ground(t);
  const root = fakeStore(path.join(g.project, '.dolly'));
  moveStore(root, root);
  assert.ok(fs.existsSync(path.join(root, 'config.json')));
});
