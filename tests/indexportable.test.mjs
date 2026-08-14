import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  globalStoreFor,
  indexFile,
  locateStore,
  readProjectIndex,
  recordProject,
} from '../dist/core/store.js';

/** Sandbox where $HOME itself is a temp dir, so under-home paths tilde-encode. */
function sandbox(t) {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-home-')));
  const prev = { home: process.env.DOLLY_HOME, real: process.env.HOME, dir: process.env.DOLLY_DIR };
  process.env.DOLLY_HOME = home;
  process.env.HOME = home;
  delete process.env.DOLLY_DIR;
  t.after(() => {
    for (const [k, v] of [
      ['DOLLY_HOME', prev.home],
      ['HOME', prev.real],
      ['DOLLY_DIR', prev.dir],
    ]) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(home, { recursive: true, force: true });
  });
  return home;
}

function repoUnder(home, rel = 'code/acme') {
  const repo = path.join(home, rel);
  fs.mkdirSync(repo, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 't@e.c'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: repo });
  fs.writeFileSync(path.join(repo, 'f'), 'x\n');
  execFileSync('git', ['add', '.'], { cwd: repo });
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: repo });
  return repo;
}

function mkStore(dir) {
  fs.mkdirSync(path.join(dir, 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.json'), '{}\n');
  return dir;
}

test('a global entry is stored tilde-encoded (key, path and store)', (t) => {
  const home = sandbox(t);
  const repo = repoUnder(home);
  const store = mkStore(globalStoreFor(repo));
  recordProject(repo, { store, local: false });

  const raw = JSON.parse(fs.readFileSync(indexFile(), 'utf8'));
  const [key, entry] = Object.entries(raw)[0];
  assert.ok(key.startsWith('~/'), `key tilde-encoded, got ${key}`);
  assert.ok(entry.path.startsWith('~/'), `path tilde-encoded, got ${entry.path}`);
  assert.ok(entry.store.startsWith('~/'), `store tilde-encoded, got ${entry.store}`);
});

test('readProjectIndex expands stored paths back to absolute for the current home', (t) => {
  const home = sandbox(t);
  const repo = repoUnder(home);
  const store = mkStore(globalStoreFor(repo));
  recordProject(repo, { store, local: false });

  const index = readProjectIndex();
  const entry = Object.values(index)[0];
  assert.ok(path.isAbsolute(entry.store), 'store expanded to absolute');
  assert.equal(entry.store, store, 'resolves back to the real store dir');
  assert.equal(locateStore(repo).root, store, 'and the store still resolves');
});

test('a synced index written on another home resolves under this home', (t) => {
  const home = sandbox(t);
  // simulate a file synced from a machine whose home was /Users/someone
  fs.mkdirSync(path.dirname(indexFile()), { recursive: true });
  const store = mkStore(path.join(home, '.dolly', 'projects', 'acme-deadbeef'));
  fs.writeFileSync(
    indexFile(),
    JSON.stringify({
      '~/code/acme': {
        path: '~/code/acme',
        local: false,
        store: '~/.dolly/projects/acme-deadbeef',
        created: '2026-01-01T00:00:00Z',
      },
    }),
  );
  const index = readProjectIndex();
  const entry = index['~/code/acme'];
  assert.equal(entry.store, store, 'expanded against THIS machine home, folder is present');
});

test('a custom store dir outside home stays absolute in the file', (t) => {
  const home = sandbox(t);
  const repo = repoUnder(home);
  const custom = mkStore(fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-custom-'))));
  t.after(() => fs.rmSync(custom, { recursive: true, force: true }));
  recordProject(repo, { store: custom, local: false });

  const raw = JSON.parse(fs.readFileSync(indexFile(), 'utf8'));
  const entry = Object.values(raw)[0];
  assert.equal(entry.store, custom, 'a path outside home is not tilde-encoded');
  assert.equal(readProjectIndex()[Object.keys(raw)[0]].store, custom, 'round-trips unchanged');
});
