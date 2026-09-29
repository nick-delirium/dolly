// Regressions from the 2026-09-29 whole-repo review: round-trips that lost or
// multiplied data, structure that user prose could break, and read-modify-write
// paths that overwrote files they failed to parse.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { changedFiles, commonDir } from '../dist/core/git.js';
import { JsonFileError, readJsonForUpdate, writeText } from '../dist/core/fsx.js';
import {
  getBlock,
  parseFrontmatter,
  removeBlock,
  setBlock,
  setSection,
  getSection,
  stringifyFrontmatter,
} from '../dist/core/md.js';
import { relatedByFiles, filesOfTask } from '../dist/core/related.js';
import { AmbiguousRef, Store, stampVersion, storeVersion } from '../dist/core/store.js';
import {
  addStep,
  createTask,
  fullSpec,
  logSection,
  reload,
  retitle,
  shortSpec,
  stepEntries,
  updateSpec,
} from '../dist/core/task.js';
import { sandbox } from './helpers.mjs';

/* ------------------------------ frontmatter ------------------------------ */

test('quoted frontmatter values survive any number of saves', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const title = 'Fix "quoted" bug in C:\\temp';
  let task = createTask(store, { title, tags: ['null', 'a,b', 'a"b', 'x]y'] });
  for (let i = 0; i < 12; i++) addStep(store, task, { summary: `step ${i}` });
  task = reload(store, task);
  assert.equal(task.meta.title, title, 'no backslash doubling');
  assert.deepEqual(task.meta.tags, ['null', 'a,b', 'a"b', 'x]y'], 'every tag intact');
  const raw = fs.readFileSync(path.join(task.dir, 'task.md'), 'utf8');
  assert.ok(raw.split('\n').every((l) => l.length < 400), 'no runaway line');
});

test('frontmatter round-trips newlines, tabs and single quotes', () => {
  const front = { a: 'line1\nline2', b: "it's", c: 'tab\there', d: 'true', e: '0001' };
  const back = parseFrontmatter(`${stringifyFrontmatter(front)}\nbody`).front;
  assert.deepEqual(back, front);
});

/* -------------------------------- sections ------------------------------- */

test('a ## heading inside user prose no longer ends the section', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Headings', specShort: 'Intro\n## Notes\nsecret' });
  assert.match(shortSpec(task), /secret/, 'create keeps the tail');
  updateSpec(store, task, { short: 'Again\n## Log\ntail' });
  assert.match(shortSpec(task), /tail/);
  addStep(store, task, { summary: 'still logs' }); // a second "## Log" would throw here
  assert.match(logSection(reload(store, task)), /still logs/);

  const body = setSection('## A\n\nx\n', 'A', 'one\n## B\ntwo');
  assert.equal(getSection(body, 'A'), 'one\n### B\ntwo');
});

test('a spec quoting dolly markers is stored whole and superseded whole', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Markers' });
  const spec = 'before\n<!-- /dolly:spec-current -->\nafter';
  updateSpec(store, task, { full: spec });
  assert.match(fullSpec(task), /after/);
  updateSpec(store, task, { full: 'v3' });
  const file = fs.readFileSync(path.join(task.dir, 'context', 'spec.md'), 'utf8');
  assert.match(file, /after/, 'the superseded v2 kept its tail');
});

test('a spec update is validated before anything is written', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Order' });
  // hand-corrupted task.md with two Log sections
  const file = path.join(task.dir, 'task.md');
  fs.writeFileSync(file, `${fs.readFileSync(file, 'utf8')}\n## Log\n\ndup\n`);
  const t2 = reload(store, task);
  assert.throws(() => updateSpec(store, t2, { full: 'new', short: 'x' }), /"## Log" headings/);
  assert.equal(reload(store, task).meta.spec_version, 1);
  assert.doesNotMatch(fs.readFileSync(path.join(task.dir, 'context', 'spec.md'), 'utf8'), /new/);
  assert.throws(() => updateSpec(store, t2, {}), /nothing to change/);
});

test('short spec and criteria edits leave a log line with the reason', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'History' });
  updateSpec(store, task, { short: 'narrower', criteria: ['c1'], reason: 'scope cut' });
  assert.match(logSection(task), /short spec \+ criteria updated\. scope cut/);
  assert.equal(task.meta.spec_version, 1, 'no version bump');
});

/* --------------------------------- blocks -------------------------------- */

test('a start marker without its end is refused, never guessed', () => {
  const src = 'keep\n<!-- dolly:instructions -->\nold\n## Build\nuser text\n';
  assert.throws(() => setBlock(src, 'instructions', 'new'), /no matching/);
  assert.equal(getBlock(src, 'instructions'), null);
  assert.equal(removeBlock(src, 'instructions'), src);
  // an end marker BEFORE the start does not pair with it
  const swapped = '<!-- /dolly:x -->\n<!-- dolly:x -->\nbody\n<!-- /dolly:x -->\n';
  assert.equal(getBlock(swapped, 'x'), 'body');
});

/* ---------------------------------- steps -------------------------------- */

test('step --status is validated and the transition is logged', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Status via step' });
  assert.throws(() => addStep(store, task, { summary: 'x', status: 'donee' }), /unknown status "donee"/);
  addStep(store, task, { summary: 'done-ish', status: 'validating' });
  assert.equal(task.meta.status, 'validating');
  assert.match(logSection(task), /status todo → validating/);
});

test('step numbers never reuse an id already in steps.md', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Merge' });
  addStep(store, task, { summary: 'a', detail: 'A' });
  addStep(store, task, { summary: 'b', detail: 'B' });
  // simulate a merge that resolved the counter to the older side
  const file = path.join(task.dir, 'task.md');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^steps: 2$/m, 'steps: 1'));
  const t2 = reload(store, task);
  assert.equal(addStep(store, t2, { summary: 'c', detail: 'C' }), 3);
  // duplicates from a real merge both stay readable
  const steps = path.join(task.dir, 'context', 'steps.md');
  fs.appendFileSync(steps, '\n<!-- dolly:step 0003 -->\ntheir C\n<!-- /dolly:step 0003 -->\n');
  assert.deepEqual(
    stepEntries(task.dir).map((e) => e.id),
    ['0001', '0002', '0003', '0003'],
  );
});

test('every file of a step stays findable, however many and however spelled', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Many files' });
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((x) => `./src/${x}.ts`);
  addStep(store, task, { summary: 'wide change', files });
  const t2 = reload(store, task);
  assert.ok(filesOfTask(t2).includes('src/h.ts'), 'the 8th file survives with no detail note');
  assert.equal(relatedByFiles(store, [path.join(store.project, 'src', 'h.ts')]).length, 1);
  assert.equal(relatedByFiles(store, ['./src/g.ts']).length, 1);
});

test('retitle treats $ sequences literally and keeps the title on one line', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Pricing page coupons' });
  const moved = retitle(store, task, "Save $$ with $& and $' coupons\nnow");
  assert.equal(moved.meta.title, "Save $$ with $& and $' coupons now");
  assert.match(moved.body, /^# \S+ · Save \$\$ with \$& and \$' coupons now$/m);
});

/* ---------------------------------- refs --------------------------------- */

test('a clear winner resolves; only a real tie is ambiguous', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const memo = createTask(store, { title: 'Memo command' });
  createTask(store, { title: 'Memo command v2' });
  const login = createTask(store, { title: 'Login page' });
  createTask(store, { title: 'Fix slow image loading' });
  assert.equal(store.resolve('memo command').meta.id, memo.meta.id, 'exact title wins');
  assert.equal(store.resolve('login').meta.id, login.meta.id, 'literal prefix beats a fuzzy hit');
  assert.throws(() => store.resolve('memo'), AmbiguousRef, 'two prefix hits stay ambiguous');
});

/* ------------------------------- JSON files ------------------------------ */

test('a config that does not parse is never read as v1 or stamped over', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  store.init();
  const conflict = '<<<<<<< ours\n{"version":6}\n=======\n{"version":7}\n>>>>>>> theirs\n';
  fs.writeFileSync(store.configPath, conflict);
  assert.throws(() => storeVersion(store.root), JsonFileError);
  assert.throws(() => stampVersion(store.root, 6), JsonFileError);
  assert.throws(() => store.saveConfig(store.config), JsonFileError);
  assert.equal(fs.readFileSync(store.configPath, 'utf8'), conflict, 'untouched');
});

test('readJsonForUpdate: missing → fallback, JSONC → flagged, garbage → error', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-json-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(readJsonForUpdate(path.join(dir, 'nope.json'), { d: 1 }), { d: 1 });
  const jsonc = path.join(dir, 'c.json');
  fs.writeFileSync(jsonc, '{\n  // model\n  "a": "x//y", /* b */ "b": [1,],\n}\n');
  assert.throws(() => readJsonForUpdate(jsonc, {}), (e) => e instanceof JsonFileError && e.jsonc);
  const bad = path.join(dir, 'b.json');
  fs.writeFileSync(bad, '{"a":');
  assert.throws(() => readJsonForUpdate(bad, {}), (e) => e instanceof JsonFileError && !e.jsonc);
});

test('writeText writes through a symlink instead of replacing it', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-link-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), 'old\n');
  fs.symlinkSync('AGENTS.md', path.join(dir, 'CLAUDE.md'));
  writeText(path.join(dir, 'CLAUDE.md'), 'new\n');
  assert.ok(fs.lstatSync(path.join(dir, 'CLAUDE.md')).isSymbolicLink());
  assert.equal(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'), 'new\n');
});

/* ----------------------------------- git --------------------------------- */

test('changedFiles: repo-relative from a subdir, non-ASCII names literal', (t) => {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-git-')));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (...a) => execFileSync('git', a, { cwd: repo, stdio: 'ignore' });
  git('init', '-q');
  fs.mkdirSync(path.join(repo, 'pkg', 'sub'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'pkg', 'sub', 'naïve.ts'), 'x');
  fs.writeFileSync(path.join(repo, 'pkg', 'b.ts'), 'x');
  assert.deepEqual(changedFiles(path.join(repo, 'pkg')), ['pkg/b.ts', 'pkg/sub/naïve.ts']);
  const cd = commonDir(path.join(repo, 'pkg'));
  assert.ok(path.isAbsolute(cd) && !cd.includes('\n'), cd);
  assert.equal(cd, path.join(repo, '.git'));
});

/* ------------------------- transcripts, memo, caches ---------------------- */

const tline = (o) => `${JSON.stringify(o)}\n`;
const human = (uuid, at, text) =>
  tline({ type: 'user', uuid, timestamp: at, cwd: '/p', sessionId: 's', origin: { kind: 'human' }, message: { role: 'user', content: text } });
const said = (at, text) =>
  tline({ type: 'assistant', uuid: `a-${at}`, timestamp: at, cwd: '/p', sessionId: 's', message: { role: 'assistant', content: [{ type: 'text', text }] } });

test('two turns that merely start alike stay two turns', async (t) => {
  const { parseTranscript } = await import('../dist/core/transcript.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-tr-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 's.jsonl');
  fs.writeFileSync(
    file,
    [
      human('u1', '2026-01-01T10:00:00Z', 'why'),
      said('2026-01-01T10:00:05Z', 'Because the cache is cold.'),
      human('u2', '2026-01-01T10:01:00Z', 'why does the build fail on CI?'),
      said('2026-01-01T10:01:05Z', 'Node 18.'),
    ].join(''),
  );
  const tr = parseTranscript({ sessionId: 's', file, mtime: Date.now(), size: 1 });
  assert.deepEqual(tr.segments.map((s) => s.uuid), ['u1', 'u2']);
  assert.equal(tr.skipped, 0);
});

test('transcript lookup never borrows another project’s sessions', async (t) => {
  const { listSessions } = await import('../dist/core/transcript.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-trdir-'));
  const prev = process.env.DOLLY_TRANSCRIPT_DIR;
  process.env.DOLLY_TRANSCRIPT_DIR = root;
  t.after(() => {
    if (prev === undefined) delete process.env.DOLLY_TRANSCRIPT_DIR;
    else process.env.DOLLY_TRANSCRIPT_DIR = prev;
    fs.rmSync(root, { recursive: true, force: true });
  });
  for (const d of ['-work-web-app', '-old-app']) {
    fs.mkdirSync(path.join(root, d));
    fs.writeFileSync(path.join(root, d, 'x.jsonl'), human('u', '2026-01-01T00:00:00Z', 'hi'));
  }
  assert.deepEqual(listSessions('/nowhere/app'), [], 'two suffix matches: a guess, so none');
  fs.rmSync(path.join(root, '-old-app'), { recursive: true });
  assert.equal(listSessions('/nowhere/app').length, 1, 'a unique suffix match is still used');
});

test('memo rejects dates that do not exist', async (t) => {
  const { buildDigest } = await import('../dist/core/memo.js');
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  store.init();
  assert.throws(() => buildDigest(store, '2026-02-31'), /bad date/);
  assert.doesNotThrow(() => buildDigest(store, '2028-02-29'));
});

test('the gh identity cache lives under DOLLY_HOME', async (t) => {
  const { resolveIdentity } = await import('../dist/core/identity.js');
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-idh-')));
  const prev = { home: process.env.DOLLY_HOME, user: process.env.DOLLY_USER };
  process.env.DOLLY_HOME = home;
  delete process.env.DOLLY_USER;
  t.after(() => {
    for (const [k, v] of [['DOLLY_HOME', prev.home], ['DOLLY_USER', prev.user]]) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(home, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(home, '.dolly'));
  fs.writeFileSync(
    path.join(home, '.dolly', 'identity.json'),
    JSON.stringify({ user: 'cached-handle', source: 'gh', at: new Date().toISOString() }),
  );
  assert.deepEqual(resolveIdentity(home), { user: 'cached-handle', source: 'gh' });
});
