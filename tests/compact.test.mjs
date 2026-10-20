import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { planCompaction, rollupMaterial, saveDigest, saveRollup } from '../dist/core/compact.js';
import { listDigests, readDigest } from '../dist/core/digest.js';
import { recall } from '../dist/core/recall.js';
import { filesOfTask } from '../dist/core/related.js';
import { importedTurns } from '../dist/reindex.js';
import { renderBoard, renderContext } from '../dist/core/render.js';
import { Store } from '../dist/core/store.js';
import { addStep, compactedFile, createTask, reload, setStatus, stepEntries, stepsFile } from '../dist/core/task.js';
import { sandbox } from './helpers.mjs';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');

function dolly(cwd, args, env = {}, input) {
  return execFileSync(process.execPath, [CLI, ...args], {
    cwd,
    input,
    encoding: 'utf8',
    env: { ...process.env, DOLLY_USER: 'tester', NO_COLOR: '1', ...env },
  });
}

/** a task with `n` steps, each carrying a body that says which step it is */
function longTask(n, title = 'Long task') {
  const task = createTask(Store.open(), { title });
  for (let i = 1; i <= n; i++) {
    addStep(Store.open(), task, {
      summary: `step ${i} done`,
      files: [`src/f${i}.ts`],
      detail: `## Slice ${i}\n\nBODY-${i}: decided thing ${i}.`,
    });
  }
  return reload(Store.open(), task);
}

/** a save pins the range the printed material showed, as the CLI requires */
function roll(task, prose, opts = {}) {
  const fresh = reload(Store.open(), task);
  return saveRollup(Store.open(), fresh, prose, { ...opts, through: opts.through ?? planCompaction(fresh, opts).through });
}

const blocks = (src) => [...src.matchAll(/<!-- dolly:step (\d+) -->[\s\S]*?<!-- \/dolly:step \1 -->/g)].map((m) => m[0]);

test('a rollup moves the old bodies verbatim and keeps the last ones live', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  const task = longTask(29);
  const before = fs.readFileSync(stepsFile(task.dir), 'utf8');

  const plan = planCompaction(task, { keep: 3 });
  assert.equal(plan.from, '0001');
  assert.equal(plan.through, '0026');
  assert.match(rollupMaterial(plan), /--through 0026 --save/);
  assert.match(rollupMaterial(plan), /BODY-1:/);
  assert.doesNotMatch(rollupMaterial(plan), /BODY-27:/, 'kept steps are not material');

  const { n } = roll(task, '### State\n\nROLLUP-PROSE', { keep: 3 });
  assert.equal(n, 30, 'the rollup takes its own number');
  const live = fs.readFileSync(stepsFile(task.dir), 'utf8');
  const moved = fs.readFileSync(compactedFile(task.dir), 'utf8');
  assert.equal(blocks(live).length, 3);
  assert.equal((live.match(/<!-- dolly:rollup 0030 -->/g) ?? []).length, 1);
  assert.equal(blocks(moved).length, 26);
  for (const b of blocks(moved)) assert.ok(before.includes(b), 'byte-identical');
  assert.match(fs.readFileSync(path.join(task.dir, 'task.md'), 'utf8'), /rolled up steps 0001–0026/);

  const next = addStep(Store.open(), reload(Store.open(), task), { summary: 'after', detail: 'AFTER' });
  assert.equal(next, 31, 'no number is reused once bodies moved out');
});

test('context shows the rollup, then the kept steps, and none of the moved bodies', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  const task = longTask(15);
  const nudged = renderContext(reload(Store.open(), task), { store: Store.open() });
  assert.match(nudged, /12 older step bodies are out of view — `dolly compact/);
  roll(task, 'ROLLUP-PROSE');
  const ctx = renderContext(reload(Store.open(), task), { store: Store.open() });
  assert.match(ctx, /## Rollup of steps 0001–0012/);
  assert.match(ctx, /ROLLUP-PROSE/);
  assert.match(ctx, /BODY-15:/);
  assert.doesNotMatch(ctx, /BODY-3:/);
  assert.doesNotMatch(ctx, /out of view/);
  assert.match(renderContext(reload(Store.open(), task), { store: Store.open(), brief: true }), /ROLLUP-PROSE/, 'the brief view keeps it');
});

test('save refuses empty prose, bad ranges and nothing to do', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  const task = longTask(5);
  const s = Store.open();
  assert.throws(() => saveRollup(s, task, '   ', { through: '0002' }), /empty rollup/);
  assert.throws(() => saveRollup(s, task, 'P', {}), /needs --through/, 'a save never re-plans the range');
  assert.throws(() => planCompaction(task, { through: '0009' }), /no live step 0009/);
  assert.throws(() => planCompaction(task, { through: '0004' }), /inside the last 3 kept in full/);
  assert.throws(() => planCompaction(task, { through: 'x' }), /step number/);
  assert.throws(() => planCompaction(longTask(3, 'Short'), {}), /nothing to compact/);
  assert.equal(planCompaction(task, { through: '0005', keep: 0 }).steps.length, 5, '--keep 0 takes everything');
});

test('a step logged after printing stays live when the range was pinned', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  const task = longTask(8);
  const { through } = planCompaction(task);
  addStep(Store.open(), reload(Store.open(), task), { summary: 'late', detail: 'LATE-BODY' });
  saveRollup(Store.open(), reload(Store.open(), task), 'P', { through });
  const live = fs.readFileSync(stepsFile(task.dir), 'utf8');
  assert.match(live, /LATE-BODY/);
  assert.match(live, /BODY-6:/, 'the window was pinned at print time, not recomputed');
});

test('re-compaction leaves one live rollup and moves the old one aside', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  const task = longTask(8);
  roll(task, 'FIRST-ROLLUP');
  for (let i = 0; i < 4; i++) addStep(Store.open(), reload(Store.open(), task), { summary: `more ${i}`, detail: `MORE-${i}` });
  const second = roll(task, 'SECOND-ROLLUP');
  assert.equal(second.plan.from, '0001', 'the new rollup speaks for the old one too');
  const live = fs.readFileSync(stepsFile(task.dir), 'utf8');
  assert.equal((live.match(/<!-- dolly:rollup /g) ?? []).length, 1);
  assert.match(live, /SECOND-ROLLUP/);
  assert.match(fs.readFileSync(compactedFile(task.dir), 'utf8'), /FIRST-ROLLUP/);
});

test('an interrupted save converges on retry, with no duplicated block', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  const task = longTask(6);
  // the crash: the compacted file got its copy, steps.md was never rewritten
  const live = fs.readFileSync(stepsFile(task.dir), 'utf8');
  const first = blocks(live)[0];
  fs.writeFileSync(compactedFile(task.dir), `# partial\n\n${first}\n`);
  roll(task, 'P');
  const moved = fs.readFileSync(compactedFile(task.dir), 'utf8');
  assert.equal(blocks(moved).length, 3);
  assert.equal((moved.match(/<!-- dolly:step 0001 -->/g) ?? []).length, 1);
});

test('a compacted id that collides with a different live body is refused, and nothing moves', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  const task = longTask(6);
  const live = fs.readFileSync(stepsFile(task.dir), 'utf8');
  // a merge brought in a branch whose already-compacted 0001 differs from ours
  const theirs = blocks(live)[0].replace('BODY-1:', 'THEIR-BODY-1:');
  fs.writeFileSync(compactedFile(task.dir), `# compacted\n\n${theirs}\n`);
  const before = { live, moved: fs.readFileSync(compactedFile(task.dir), 'utf8') };
  assert.throws(() => roll(task, 'P'), /already holds a different step 0001/);
  assert.equal(fs.readFileSync(stepsFile(task.dir), 'utf8'), before.live, 'our body is still live');
  assert.equal(fs.readFileSync(compactedFile(task.dir), 'utf8'), before.moved);
});

test('a merged steps.md holding one id twice is refused, not guessed at', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  const task = longTask(6);
  const live = fs.readFileSync(stepsFile(task.dir), 'utf8');
  fs.writeFileSync(stepsFile(task.dir), `${live}\n${blocks(live)[1]}\n`);
  assert.throws(() => planCompaction(reload(Store.open(), task)), /holds step 0002 twice/);
});

test('moved bodies stay findable: recall, recorded files, imported turns', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  const task = createTask(Store.open(), { title: 'Imported' });
  addStep(Store.open(), task, { summary: 'imported turn', detail: 'BODY-1: from a transcript', files: ['src/f1.ts'], source: 'session s1 · turn T-ONE' });
  for (let i = 2; i <= 6; i++) addStep(Store.open(), reload(Store.open(), task), { summary: `s${i}`, detail: `BODY-${i}` });
  roll(task, 'P');
  // reindex must not import that turn a second time just because its body moved
  assert.ok(importedTurns(reload(Store.open(), task)).has('T-ONE'));
  const res = recall([Store.open()], 'BODY-1');
  const hit = res.hits.find((h) => h.file === compactedFile(task.dir));
  assert.ok(hit, 'recall reads steps.compacted.md');
  assert.match(fs.readFileSync(hit.file, 'utf8').split('\n')[hit.line - 1], /BODY-1/);
  assert.match(hit.label, /compacted/);
  assert.ok(filesOfTask(reload(Store.open(), task)).includes('src/f1.ts'));
  assert.equal(stepEntries(task.dir, { compacted: true }).length, 6);
  assert.equal(stepEntries(task.dir).length, 3);
});

test('a digest covers several tasks, stamps them, and folds the finished ones', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  const a = longTask(2, 'Pi target');
  const b = longTask(2, 'Opencode target');
  const c = longTask(2, 'Zcode target');
  setStatus(Store.open(), reload(Store.open(), a), 'done');
  setStatus(Store.open(), reload(Store.open(), b), 'done');
  const tasks = [a, b, c].map((x) => reload(Store.open(), x));
  assert.throws(() => saveDigest(Store.open(), [tasks[0]], 'Solo', 'x'), /two or more/);
  const d = saveDigest(Store.open(), tasks, 'Install targets', '### How it works\n\nDIGEST-PROSE');
  assert.equal(d.slug, 'install-targets');
  const read = readDigest(d.file);
  assert.deepEqual(read.covers, [a.meta.id, b.meta.id, c.meta.id]);
  assert.match(read.body, /DIGEST-PROSE/);
  for (const x of [a, b, c]) {
    const fresh = reload(Store.open(), x);
    assert.equal(fresh.meta.digest, 'install-targets');
    assert.match(fs.readFileSync(path.join(fresh.dir, 'task.md'), 'utf8'), /^digest: install-targets$/m);
    assert.match(fs.readFileSync(path.join(fresh.dir, 'task.md'), 'utf8'), /rolled into digest `install-targets`/);
  }
  const board = renderBoard(Store.open(), Store.open().loadTasks());
  assert.match(board, /⧉ Install targets {2}2 tasks · dolly digest install-targets/);
  assert.match(board, /Zcode target/, 'unfinished covered tasks stay on the board');
  assert.doesNotMatch(board, /Pi target/);
  assert.match(renderContext(reload(Store.open(), c), { store: Store.open() }), /Rolled into digest `install-targets`/);
  assert.equal(recall([Store.open()], 'DIGEST-PROSE').hits[0].kind, 'digest');

  // saving again keeps the old prose as history and never forks the task
  saveDigest(Store.open(), [a, b, c].map((x) => reload(Store.open(), x)), 'Install targets', 'NEWER-PROSE');
  const raw = fs.readFileSync(d.file, 'utf8');
  assert.match(raw, /NEWER-PROSE/);
  assert.match(raw, /## Previous versions[\s\S]*DIGEST-PROSE/);
  assert.equal(listDigests(Store.open()).length, 1);
  const other = longTask(1, 'Unrelated');
  assert.throws(
    () => saveDigest(Store.open(), [reload(Store.open(), a), reload(Store.open(), other)], 'Elsewhere', 'x'),
    /already in digest install-targets/,
  );
});

test('CLI: print, save from stdin, digest list; MCP: dolly_compact', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  const task = longTask(6);
  const env = { DOLLY_DIR: sb.store };
  const material = dolly(sb.dir, ['compact', task.meta.id], env);
  const through = /--through (\d{4})/.exec(material)[1];
  const bare = spawnSync(process.execPath, [CLI, 'compact', task.meta.id, '--save', '--file', '-'], {
    cwd: sb.dir, input: 'x', encoding: 'utf8', env: { ...process.env, ...env, DOLLY_USER: 'tester', NO_COLOR: '1' },
  });
  assert.match(bare.stderr, /needs --through/);
  const typo = spawnSync(process.execPath, [CLI, 'compact', task.meta.id, '--keep', 'abc'], {
    cwd: sb.dir, encoding: 'utf8', env: { ...process.env, ...env, DOLLY_USER: 'tester', NO_COLOR: '1' },
  });
  assert.match(typo.stderr, /--keep takes a number, not "abc"/);
  const out = dolly(sb.dir, ['compact', task.meta.id, '--through', through, '--save', '--file', '-'], env, '### State\n\nCLI-ROLLUP\n');
  assert.match(out, /rollup 0007 .* covers steps 0001–0003/);
  assert.match(dolly(sb.dir, ['context', task.meta.id], env), /CLI-ROLLUP/);

  const other = longTask(1, 'Second');
  dolly(sb.dir, ['compact', '--tasks', `${task.meta.id},${other.meta.id}`, '--title', 'Area', '--save', '--file', '-'], env, 'AREA-PROSE');
  assert.match(dolly(sb.dir, ['digest'], env), /area {2}Area {2}2 tasks/);
  assert.match(dolly(sb.dir, ['digest', 'area'], env), /AREA-PROSE/);

  const r = spawnSync(process.execPath, [CLI, 'mcp'], {
    cwd: sb.dir,
    input: `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'dolly_compact', arguments: { ref: other.meta.id, keep: 0 } } })}\n`,
    encoding: 'utf8',
    env: { ...process.env, ...env, DOLLY_USER: 'tester', NO_COLOR: '1' },
  });
  const reply = JSON.parse(r.stdout.trim().split('\n').pop());
  assert.match(reply.result.content[0].text, /--through 0001 --save/);
});
