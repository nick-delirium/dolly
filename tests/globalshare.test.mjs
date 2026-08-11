import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  forgetProject,
  globalStoreFor,
  indexFile,
  linkedStore,
  locateStore,
  recordProject,
  repoIdentity,
} from '../dist/core/store.js';

function sandbox(t) {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-home-')));
  const prev = { home: process.env.DOLLY_HOME, dir: process.env.DOLLY_DIR };
  process.env.DOLLY_HOME = home;
  delete process.env.DOLLY_DIR;
  t.after(() => {
    if (prev.home === undefined) delete process.env.DOLLY_HOME;
    else process.env.DOLLY_HOME = prev.home;
    if (prev.dir !== undefined) process.env.DOLLY_DIR = prev.dir;
    fs.rmSync(home, { recursive: true, force: true });
  });
  return home;
}

function makeRepo(t, name = 'repo') {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-repo-')));
  const repo = path.join(base, name);
  fs.mkdirSync(repo);
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 't@e.c'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: repo });
  fs.writeFileSync(path.join(repo, 'f'), 'x\n');
  execFileSync('git', ['add', '.'], { cwd: repo });
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: repo });
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  return repo;
}

function addWorktree(t, repo, name) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-wt-')));
  const wt = path.join(base, name);
  execFileSync('git', ['worktree', 'add', '-q', wt, 'HEAD'], { cwd: repo });
  t.after(() => {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', wt], { cwd: repo });
    } catch {}
    fs.rmSync(base, { recursive: true, force: true });
  });
  return wt;
}

test('repoIdentity is the repo root, identical across worktrees, null outside git', (t) => {
  const repo = makeRepo(t);
  const wt = addWorktree(t, repo, 'linked');
  assert.equal(repoIdentity(repo), repo, 'identity of the main checkout is its root');
  assert.equal(repoIdentity(wt), repo, 'a linked worktree shares the same identity');

  const plain = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-plain-')));
  t.after(() => fs.rmSync(plain, { recursive: true, force: true }));
  assert.equal(repoIdentity(plain), null);
});

test('globalStoreFor is the same folder for every worktree of a repo', (t) => {
  sandbox(t);
  const repo = makeRepo(t);
  const wt = addWorktree(t, repo, 'linked');
  assert.equal(globalStoreFor(wt), globalStoreFor(repo), 'worktrees share one store folder');
});

test('a non-git directory still gets a defined store keyed on its own path', (t) => {
  sandbox(t);
  const a = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-plain-')));
  const b = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-plain-')));
  t.after(() => {
    fs.rmSync(a, { recursive: true, force: true });
    fs.rmSync(b, { recursive: true, force: true });
  });
  assert.ok(globalStoreFor(a));
  assert.notEqual(globalStoreFor(a), globalStoreFor(b), 'distinct non-git dirs stay distinct');
});

test('two worktrees resolve global storage to the same store after one opts in', (t) => {
  sandbox(t);
  const repo = makeRepo(t);
  const wt = addWorktree(t, repo, 'linked');

  // opt the repo into a global store (as `init --store global` would)
  const store = globalStoreFor(repo);
  fs.mkdirSync(path.join(store, 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(store, 'config.json'), '{}\n');
  recordProject(repo, { store, local: false });

  const fromMain = locateStore(repo);
  const fromWorktree = locateStore(wt);
  assert.equal(fromMain.root, store);
  assert.equal(fromWorktree.root, store, 'the linked worktree finds the shared store');
  assert.equal(fromWorktree.kind, 'linked');
});

test('a committed .dolly still wins per worktree over the shared global store', (t) => {
  sandbox(t);
  const repo = makeRepo(t);
  const wt = addWorktree(t, repo, 'linked');

  const store = globalStoreFor(repo);
  fs.mkdirSync(path.join(store, 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(store, 'config.json'), '{}\n');
  recordProject(repo, { store, local: false });

  // worktree has its own committed .dolly on disk
  fs.mkdirSync(path.join(wt, '.dolly', 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(wt, '.dolly', 'config.json'), '{}\n');

  const loc = locateStore(wt);
  assert.equal(loc.kind, 'found', 'disk .dolly wins');
  assert.equal(loc.root, path.join(wt, '.dolly'));
});

test('a local entry is still keyed per path, not shared across worktrees', (t) => {
  sandbox(t);
  const repo = makeRepo(t);
  const wt = addWorktree(t, repo, 'linked');
  // record the MAIN checkout as a local project
  recordProject(repo, { store: path.join(repo, '.dolly'), local: true });
  const index = JSON.parse(fs.readFileSync(indexFile(), 'utf8'));
  // the linked worktree must NOT resolve to the main checkout's local entry
  const loc = locateStore(wt);
  assert.notEqual(loc.kind, 'linked', 'local entry does not leak into the worktree');
});

test('unlink from a linked worktree still forgets the shared global entry', (t) => {
  sandbox(t);
  const repo = makeRepo(t);
  const wt = addWorktree(t, repo, 'linked');
  const store = globalStoreFor(repo);
  fs.mkdirSync(path.join(store, 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(store, 'config.json'), '{}\n');
  recordProject(repo, { store, local: false });

  forgetProject(wt); // run from the worktree, not the main checkout
  const index = JSON.parse(fs.readFileSync(indexFile(), 'utf8'));
  assert.deepEqual(index, {}, 'the shared entry is gone regardless of which worktree unlinked');
  assert.equal(linkedStore(wt), null);
});

test('linkedStore resolves the shared global store from a linked worktree', (t) => {
  sandbox(t);
  const repo = makeRepo(t);
  const wt = addWorktree(t, repo, 'linked');
  const store = globalStoreFor(repo);
  fs.mkdirSync(path.join(store, 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(store, 'config.json'), '{}\n');
  recordProject(repo, { store, local: false });
  assert.equal(linkedStore(wt), store);
});
