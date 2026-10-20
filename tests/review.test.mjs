import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { renderBoard } from '../dist/core/render.js';
import { Store } from '../dist/core/store.js';
import { createTask, criteriaList, handoffNote, reload, setCriterion, setStatus } from '../dist/core/task.js';
import { runReview } from '../dist/review.js';
import { ageTask, daysAgo, sandbox } from './helpers.mjs';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');

/** a terminal that answers from a script; `onLine` can act before each answer */
function scriptTerm({ keys = [], lines = [], raw = false, onLine } = {}) {
  const out = [];
  return {
    raw,
    columns: 100,
    text: () => out.join(''),
    write: (s) => out.push(s),
    key: async () => {
      if (!keys.length) throw new Error('key input exhausted');
      return { name: keys.shift(), ctrl: false, seq: '' };
    },
    line: async () => {
      if (onLine) await onLine();
      if (!lines.length) throw new Error('line input exhausted');
      return lines.shift();
    },
    close: () => {},
  };
}

function handed(title, criteria, age) {
  const s = Store.open();
  const task = createTask(s, { title, criteria });
  setStatus(Store.open(), reload(Store.open(), task), 'working');
  setStatus(Store.open(), reload(Store.open(), task), 'validating', `check ${title} by hand`);
  if (age) ageTask(task.dir, daysAgo(age));
  return task;
}

test('a criterion toggles alone: one box changes, the log says who and which', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  const task = handed('Toggle', ['first works', 'second works', 'third works']);
  const before = fs.readFileSync(path.join(task.dir, 'task.md'), 'utf8');
  assert.equal(setCriterion(Store.open(), reload(Store.open(), task), 2, true), true);
  const after = fs.readFileSync(path.join(task.dir, 'task.md'), 'utf8');
  const diff = after.split('\n').filter((l, i) => l !== before.split('\n')[i]);
  assert.ok(diff.includes('- [x] second works'));
  assert.deepEqual(criteriaList(reload(Store.open(), task)).map((c) => c.checked), [false, true, false]);
  assert.match(after, /criteria: #2 checked — second works/);
  assert.equal(setCriterion(Store.open(), reload(Store.open(), task), 2, true), false, 'already checked: nothing written');
  setCriterion(Store.open(), reload(Store.open(), task), 2, false);
  assert.deepEqual(criteriaList(reload(Store.open(), task)).map((c) => c.checked), [false, false, false]);
  assert.throws(() => setCriterion(Store.open(), reload(Store.open(), task), 9, true), /no criterion #9/);
  // frontmatter survives every save
  const fresh = reload(Store.open(), task);
  assert.equal(fresh.meta.title, 'Toggle');
  assert.equal(fresh.meta.status, 'validating');
});

test('the criteria heading matches in any case, as getSection does', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  const task = handed('Casing', ['tests pass']);
  const file = path.join(task.dir, 'task.md');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('## Success Criteria', '## Success criteria'));
  assert.deepEqual(criteriaList(reload(Store.open(), task)).map((c) => c.text), ['tests pass']);
  assert.ok(setCriterion(Store.open(), reload(Store.open(), task), 1, true));
});

test('the hand-over note is the latest move into validating', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  const task = handed('Note', ['x']);
  setStatus(Store.open(), reload(Store.open(), task), 'working', 'not yet');
  setStatus(Store.open(), reload(Store.open(), task), 'validating', 'run npm test\nthen open the board');
  assert.equal(handoffNote(reload(Store.open(), task), 'validating'), 'run npm test\nthen open the board');
});

test('review walks the queue oldest first: tick, done, send back, skip (numbered terminal)', async (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  const old = handed('Oldest', ['a holds', 'b holds'], 9);
  const mid = handed('Middle', ['c holds'], 5);
  const young = handed('Youngest', [], 1);
  const term = scriptTerm({
    lines: [
      '2', // Oldest: tick criteria…
      '1,2', // toggle both on
      '', // keep as shown
      '1', // done (all checked, no confirm)
      '3', // Middle: back to working
      'the c path still fails', // the note
      '3', // Youngest: only the _TBD_ placeholder, so no tick option — skip is 3rd
    ],
  });
  const r = await runReview({ term, open: () => Store.open() });
  assert.deepEqual(r, { done: [old.meta.id], back: [mid.meta.id], skipped: [young.meta.id], ticked: 2 });
  assert.equal(reload(Store.open(), old).meta.status, 'done');
  assert.deepEqual(criteriaList(reload(Store.open(), old)).map((c) => c.checked), [true, true]);
  const back = reload(Store.open(), mid);
  assert.equal(back.meta.status, 'working');
  assert.match(fs.readFileSync(path.join(back.dir, 'task.md'), 'utf8'), /status validating → working\. the c path still fails/);
  assert.match(term.text(), /Agent says to check:.*check Oldest by hand/);
  assert.ok(term.text().indexOf('Oldest') < term.text().indexOf('Middle'), 'oldest first');
  assert.deepEqual(criteriaList(reload(Store.open(), young)), [], 'a placeholder is not a criterion');
});

test('done with open criteria asks first; a refused confirm changes nothing (arrow keys)', async (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  const task = handed('Unchecked', ['not yet verified']);
  // enter on "Done" → confirm says no → menu again → down×3 to Quit
  const term = scriptTerm({ raw: true, keys: ['return', 'n', 'down', 'down', 'down', 'down', 'return'] });
  const r = await runReview({ term, open: () => Store.open() });
  assert.deepEqual(r.done, []);
  assert.equal(reload(Store.open(), task).meta.status, 'validating');
  assert.match(term.text(), /1 criteria unchecked — mark done anyway\?/);
});

test('the store lock is free while review waits on a person', async (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  const task = handed('Waiting', ['x']);
  let wrote = '';
  const term = scriptTerm({
    lines: ['4'], // skip
    onLine: async () => {
      // another process writes while the prompt is open — it must not wait out the lock
      const t0 = Date.now();
      wrote = execFileSync(process.execPath, [CLI, 'step', task.meta.id, '-m', 'written mid-review'], {
        cwd: sb.dir,
        encoding: 'utf8',
        env: { ...process.env, DOLLY_DIR: sb.store, DOLLY_USER: 'other', NO_COLOR: '1' },
      });
      assert.ok(Date.now() - t0 < 5000, 'not blocked on the lock');
    },
  });
  await runReview({ term, open: () => Store.open() });
  assert.match(wrote, /step 0001 logged/);
});

test('without a terminal, review refuses and touches nothing', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  const task = handed('Agent tries', ['x']);
  const before = fs.readFileSync(path.join(task.dir, 'task.md'), 'utf8');
  const r = spawnSync(process.execPath, [CLI, 'review'], {
    cwd: sb.dir,
    encoding: 'utf8',
    env: { ...process.env, DOLLY_DIR: sb.store, DOLLY_USER: 'tester', NO_COLOR: '1' },
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /dolly review is for a human at a terminal/);
  assert.equal(fs.readFileSync(path.join(task.dir, 'task.md'), 'utf8'), before);
});

test('the board points a human at the queue', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  handed('Queued', ['x']);
  assert.match(renderBoard(Store.open(), Store.open().loadTasks()), /1 awaiting a human — `dolly review`/);
});
