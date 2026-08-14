import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { globalStoreFor, projectsDir, recordProject } from '../dist/core/store.js';

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

function makeRepo(t) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-repo-')));
  execFileSync('git', ['init', '-q'], { cwd: base });
  execFileSync('git', ['config', 'user.email', 't@e.c'], { cwd: base });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: base });
  fs.writeFileSync(path.join(base, 'f'), 'x\n');
  execFileSync('git', ['add', '.'], { cwd: base });
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: base });
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  return base;
}

function mkStore(dir) {
  fs.mkdirSync(path.join(dir, 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.json'), '{}\n');
  return dir;
}

test('the first global store turns ~/.dolly/projects into a git repo', (t) => {
  sandbox(t);
  const repo = makeRepo(t);
  recordProject(repo, { store: mkStore(globalStoreFor(repo)), local: false });
  assert.equal(fs.existsSync(path.join(projectsDir(), '.git')), true, 'projects/ is now a git repo');
});

test('git-init is idempotent and preserves an existing repo/history', (t) => {
  sandbox(t);
  const a = makeRepo(t);
  const b = makeRepo(t);
  recordProject(a, { store: mkStore(globalStoreFor(a)), local: false });
  // drop a marker commit; a re-init must not wipe it
  const dir = projectsDir();
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-qm', 'first'], { cwd: dir });
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();

  recordProject(b, { store: mkStore(globalStoreFor(b)), local: false });
  const stillHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
  assert.equal(stillHead, head, 'existing history untouched by the second global store');
});

test('a purely local record does not git-init projects/', (t) => {
  sandbox(t);
  const repo = makeRepo(t);
  recordProject(repo, { store: path.join(repo, '.dolly'), local: true });
  assert.equal(
    fs.existsSync(path.join(projectsDir(), '.git')),
    false,
    'local stores need no backup repo',
  );
});
