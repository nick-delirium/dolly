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
  projectEntry,
  readProjectIndex,
  recordProject,
  storeConflict,
} from '../dist/core/store.js';

const CLI = path.resolve(import.meta.dirname, '..', 'dist', 'cli.js');

function ground(t, { git = true } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-home-'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-proj-'));
  const prev = { home: process.env.DOLLY_HOME, dir: process.env.DOLLY_DIR, real: process.env.HOME };
  process.env.DOLLY_HOME = home;
  process.env.HOME = home;
  delete process.env.DOLLY_DIR;
  if (git) execFileSync('git', ['init', '-q'], { cwd: project });
  t.after(() => {
    for (const [k, v] of [['DOLLY_HOME', prev.home], ['DOLLY_DIR', prev.dir], ['HOME', prev.real]]) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(project, { recursive: true, force: true });
  });
  return { home: fs.realpathSync(home), project: fs.realpathSync(project) };
}

function dolly(cwd, args, env = {}) {
  return execFileSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, DOLLY_USER: 'tester', NO_COLOR: '1', ...env },
  });
}

/* ---------------------------- self-registration --------------------------- */

test('a repo-local store records itself, so local is a fact and not an absence', (t) => {
  const g = ground(t);
  dolly(g.project, ['init', '--yes', '--no-agents']);

  const entry = projectEntry(g.project);
  assert.ok(entry, 'the project is known');
  assert.equal(entry.local, true);
  assert.equal(entry.store, path.join(g.project, '.dolly'));
  assert.equal(entry.path, g.project);
});

/**
 * A committed `.dolly/` and an empty registry — what a teammate's clone looks
 * like. Built through the CLI under DOLLY_DIR, which creates a *complete* store
 * without recording anything: a hand-rolled one is missing the store .gitignore,
 * which makes the next command apply a lossless migration, and that write
 * registers the project — real behaviour, but not what these tests are about.
 */
function seedClone(g) {
  dolly(g.project, ['init', '--yes', '--no-agents'], { DOLLY_DIR: path.join(g.project, '.dolly') });
  assert.equal(fs.existsSync(indexFile(g.home)), false, 'a pinned store records nothing');
}

test('a store cloned from a teammate registers on the first write, no setup needed', (t) => {
  const g = ground(t);
  seedClone(g);

  dolly(g.project, ['new', 'inherited work', '--short', 's']);
  assert.equal(projectEntry(g.project).local, true);
});

test('reads do not write the registry', (t) => {
  const g = ground(t);
  seedClone(g);
  dolly(g.project, ['board']);
  dolly(g.project, ['whoami']);
  dolly(g.project, ['projects']);
  assert.equal(fs.existsSync(indexFile(g.home)), false, 'reading is not a decision');
});

test('a DOLLY_DIR store is never recorded — it was pinned, not chosen', (t) => {
  const g = ground(t);
  const pinned = path.join(g.home, 'pinned', '.dolly');
  dolly(g.project, ['init', '--yes', '--no-agents'], { DOLLY_DIR: pinned });
  dolly(g.project, ['new', 'x', '--short', 's'], { DOLLY_DIR: pinned });
  assert.equal(fs.existsSync(indexFile(g.home)), false);
});

test('recording twice keeps the original created stamp and writes nothing new', (t) => {
  const g = ground(t);
  const root = path.join(g.project, '.dolly');
  recordProject(g.project, { store: root, local: true });
  const first = fs.readFileSync(indexFile(g.home), 'utf8');
  recordProject(g.project, { store: root, local: true });
  assert.equal(fs.readFileSync(indexFile(g.home), 'utf8'), first, 'byte-identical, no churn');

  recordProject(g.project, { store: root, local: false });
  assert.equal(projectEntry(g.project).local, false, 'a real change is written');
  assert.equal(
    projectEntry(g.project).created,
    JSON.parse(first)[g.project].created,
    'created survives a change of mind',
  );
});

/* ------------------------------ old format -------------------------------- */

test('the first index format still reads, and upgrades on the next write', (t) => {
  const g = ground(t);
  const store = globalStoreFor(g.project, g.home);
  fs.mkdirSync(path.join(store, 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(store, 'config.json'), '{"version":4}\n');
  // the shape before entries carried anything but a path
  fs.mkdirSync(path.dirname(indexFile(g.home)), { recursive: true });
  fs.writeFileSync(indexFile(g.home), JSON.stringify({ [g.project]: store }, null, 2));

  const entry = projectEntry(g.project);
  assert.equal(entry.store, store);
  assert.equal(entry.local, false, 'the old shape was only ever written for out-of-repo stores');
  assert.equal(locateStore(g.project).kind, 'linked', 'resolution still works');

  recordProject(g.project, { store, local: false });
  const raw = JSON.parse(fs.readFileSync(indexFile(g.home), 'utf8'));
  assert.equal(typeof raw[g.project], 'object', 'upgraded in place');
});

test('a corrupt entry is skipped rather than fatal', (t) => {
  const g = ground(t);
  fs.mkdirSync(path.dirname(indexFile(g.home)), { recursive: true });
  fs.writeFileSync(
    indexFile(g.home),
    JSON.stringify({ '/a': null, '/b': { local: true }, [g.project]: { store: '/nope', local: true } }),
  );
  const index = readProjectIndex(indexFile(g.home));
  assert.deepEqual(Object.keys(index), [g.project], 'entries with no store are dropped');
  assert.doesNotThrow(() => locateStore(g.project));
});

/* ------------------------------- conflicts -------------------------------- */

test('a recorded private store and a committed .dolly/ is reported, not silently picked', (t) => {
  const g = ground(t);
  // went private…
  const priv = globalStoreFor(g.project, g.home);
  fs.mkdirSync(path.join(priv, 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(priv, 'config.json'), '{"version":4}\n');
  recordProject(g.project, { store: priv, local: false });
  // …then pulled a branch where a teammate committed one
  fs.mkdirSync(path.join(g.project, '.dolly', 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(g.project, '.dolly', 'config.json'), '{"version":4}\n');

  const loc = locateStore(g.project);
  assert.equal(loc.root, path.join(g.project, '.dolly'), 'the shared store wins');

  const clash = storeConflict(loc);
  assert.ok(clash);
  assert.equal(clash.recorded.store, priv);

  const res = execFileSync(process.execPath, [CLI, 'board'], {
    cwd: g.project,
    encoding: 'utf8',
    env: { ...process.env, DOLLY_USER: 'tester', NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.match(res, /TODO|dolly ·/i, 'the command still works');
});

test('no conflict when the registry and the disk agree', (t) => {
  const g = ground(t);
  dolly(g.project, ['init', '--yes', '--no-agents']);
  assert.equal(storeConflict(locateStore(g.project)), null);
});

test('the conflict warning goes to stderr and never to a machine-read stream', (t) => {
  const g = ground(t);
  const priv = globalStoreFor(g.project, g.home);
  fs.mkdirSync(path.join(priv, 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(priv, 'config.json'), '{"version":4}\n');
  recordProject(g.project, { store: priv, local: false });
  fs.mkdirSync(path.join(g.project, '.dolly', 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(g.project, '.dolly', 'config.json'), '{"version":4}\n');

  const run = (args) =>
    execFileSync(process.execPath, [CLI, ...args], {
      cwd: g.project,
      encoding: 'utf8',
      env: { ...process.env, DOLLY_USER: 'tester', NO_COLOR: '1' },
    });

  const board = execFileSync(process.execPath, [CLI, 'board'], {
    cwd: g.project,
    encoding: 'utf8',
    env: { ...process.env, DOLLY_USER: 'tester', NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.doesNotMatch(board, /private store at/, 'stdout stays clean');

  const hook = run(['hook', 'session-start']);
  assert.doesNotMatch(hook, /private store at/);
  if (hook.trim()) JSON.parse(hook); // must remain valid JSON
});

/* ------------------------------ the listing -------------------------------- */

test('dolly projects lists what dolly knows, marking the one you are in', (t) => {
  const g = ground(t);
  dolly(g.project, ['init', '--yes', '--no-agents']);
  dolly(g.project, ['new', 'a task', '--short', 's']);

  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-proj2-'));
  t.after(() => fs.rmSync(other, { recursive: true, force: true }));
  dolly(other, ['init', '--yes', '--no-agents']);

  const out = dolly(g.project, ['projects']);
  assert.match(out, /2 projects/);
  assert.match(out, /in repo/);
  assert.match(out, /1 task/);
  assert.match(out, /▸/, 'the current project is marked');

  const json = JSON.parse(dolly(g.project, ['projects', '--json']));
  assert.equal(json.projects.length, 2);
  const mine = json.projects.find((p) => p.path === g.project);
  assert.equal(mine.local, true);
  assert.equal(mine.tasks, 1);
  assert.equal(mine.current, true);
});

test('a private store is listed as private, with its task count', (t) => {
  const g = ground(t);
  const store = globalStoreFor(g.project, g.home);
  dolly(g.project, ['init', '--yes', '--no-agents'], { DOLLY_DIR: store });
  recordProject(g.project, { store, local: false });
  dolly(g.project, ['new', 'private work', '--short', 's']);

  const json = JSON.parse(dolly(g.project, ['projects', '--json']));
  assert.equal(json.projects[0].local, false);
  assert.equal(json.projects[0].tasks, 1);
  assert.match(dolly(g.project, ['projects']), /private/);
});

test('a store that is gone shows as missing and prunes away', (t) => {
  const g = ground(t);
  dolly(g.project, ['init', '--yes', '--no-agents']);
  fs.rmSync(path.join(g.project, '.dolly'), { recursive: true, force: true });

  assert.match(dolly(g.project, ['projects']), /store missing/);
  assert.equal(JSON.parse(dolly(g.project, ['projects', '--json'])).projects[0].tasks, null);

  assert.match(dolly(g.project, ['projects', '--prune']), /forgot 1 project/);
  assert.deepEqual(readProjectIndex(indexFile(g.home)), {});
  assert.match(dolly(g.project, ['projects', '--prune']), /nothing to prune/);
});

test('projects says something useful when it knows nothing', (t) => {
  const g = ground(t);
  assert.match(dolly(g.project, ['projects']), /no projects yet/);
});

/* --------------------------------- whoami --------------------------------- */

test('whoami states whether the store is in the repo', (t) => {
  const g = ground(t);
  dolly(g.project, ['init', '--yes', '--no-agents']);
  const out = dolly(g.project, ['whoami']);
  assert.match(out, /in the repo — commit it/);
  const json = JSON.parse(dolly(g.project, ['whoami', '--json']));
  assert.equal(json.storeLocal, true);
  assert.equal(json.recorded.local, true);
});
