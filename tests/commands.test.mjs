// The command surface: what was merged away points at its replacement, the
// replacements do the old jobs, and no shipped doc teaches a removed name.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { Store } from '../dist/core/store.js';
import { addStep, createTask, reload } from '../dist/core/task.js';
import { AGENT_BLOCK } from '../dist/templates/instructions.js';
import { sandbox } from './helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'dist', 'cli.js');

function run(cwd, args, { input, env = {} } = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    input,
    encoding: 'utf8',
    env: { ...process.env, DOLLY_USER: 'tester', NO_COLOR: '1', DOLLY_NO_UPDATE_CHECK: '1', ...env },
  });
  return { out: r.stdout ?? '', err: r.stderr ?? '', code: r.status };
}

const REMOVED = {
  current: 'dolly context',
  setup: 'dolly init',
  retitle: 'dolly spec <ref> --title',
  rename: 'dolly spec <ref> --title',
  related: 'dolly why <file...>',
  defaults: 'dolly config --defaults',
  version: 'dolly --version',
  memo: 'dolly dream',
  digest: 'dolly dream',
};

test('every removed name exits 1 and says what replaced it — even with its old flags', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  for (const [name, use] of Object.entries(REMOVED)) {
    const r = run(sb.dir, [name, '--files', 'a.ts', '--save']);
    assert.equal(r.code, 1, name);
    assert.ok(r.err.includes(`\`${name}\` was removed — use \`${use}`), `${name}: ${r.err}`);
  }
  const plan = run(sb.dir, ['plan', 'show', 'x']);
  assert.equal(plan.code, 1);
  assert.match(plan.err, /`plan show` was removed — `dolly context <ref>`/);
  for (const gone of ['archive', 'restore']) assert.match(run(sb.dir, [gone]).err, /unknown command/);
});

test('help lists at most 26 commands and none of the removed ones', () => {
  const help = run(ROOT, ['help']).out;
  const body = help.slice(help.indexOf('READ'), help.indexOf('REFS'));
  const names = new Set();
  for (const line of body.split('\n')) {
    const m = /^ {2}([a-z][a-z-]*)\b/.exec(line);
    if (!m) continue;
    names.add(m[1]);
    // `mcp | hook … | statusline` shares one line
    if (m[1] === 'mcp') for (const x of line.matchAll(/\| ([a-z]+)\b/g)) if (x[1] !== 'stop') names.add(x[1]);
  }
  for (const gone of Object.keys(REMOVED)) assert.ok(!names.has(gone), `help still lists ${gone}`);
  assert.ok(names.size <= 26, `${names.size}: ${[...names].join(' ')}`);
  assert.match(run(ROOT, ['--version']).out, /^\d+\.\d+\.\d+/);
});

test('no shipped doc or prompt teaches a removed command', () => {
  const files = [
    path.join(ROOT, 'README.md'),
    ...['dolly', 'dolly-planning'].map((s) => path.join(ROOT, 'skills', s, 'SKILL.md')),
    ...fs.readdirSync(path.join(ROOT, 'commands')).map((f) => path.join(ROOT, 'commands', f)),
  ];
  const texts = files.map((f) => [f, fs.readFileSync(f, 'utf8')]);
  texts.push(['AGENT_BLOCK', AGENT_BLOCK]);
  const bad = /`?dolly (current|setup|retitle|rename|related|defaults|version|memo|digest)\b|plan show|compact --tasks|\/dolly:memo/;
  for (const [file, text] of texts) {
    for (const [i, line] of text.split('\n').entries()) {
      // the README's own list of what was removed is the one place they belong
      if (/was removed|Removed in this version|were the earlier halves/.test(line)) continue;
      assert.doesNotMatch(line, bad, `${path.basename(file)}:${i + 1}: ${line}`);
    }
  }
});

test('show is context; --full reads every step in full; config --defaults', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Same view' });
  for (let i = 1; i <= 5; i++) addStep(store, reload(store, task), { summary: `s${i}`, detail: `BODY-${i}` });
  assert.equal(run(sb.dir, ['show', task.meta.id]).out, run(sb.dir, ['context', task.meta.id]).out);
  const full = run(sb.dir, ['context', task.meta.id, '--full']).out;
  for (let i = 1; i <= 5; i++) assert.match(full, new RegExp(`BODY-${i}`));
  assert.doesNotMatch(run(sb.dir, ['context', task.meta.id]).out, /BODY-1\b/, 'the default keeps the last 3');
  assert.equal(JSON.parse(run(sb.dir, ['config', '--defaults']).out).staleDays, 14);
});

test('spec --title renames the task and its directory; other fields still work alongside', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const task = createTask(Store.open(), { title: 'Old name' });
  const r = run(sb.dir, ['spec', task.meta.id, '--title', 'New name']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /"Old name" → "New name"/);
  const after = Store.open().resolve(task.meta.id);
  assert.equal(after.meta.title, 'New name');
  assert.match(after.rel, /new-name$/);
  const both = run(sb.dir, ['spec', task.meta.id, '--title', 'Newer', '--short', 'SHORT-NOW']);
  assert.equal(both.code, 0, both.err);
  const final = Store.open().resolve(task.meta.id);
  assert.equal(final.meta.title, 'Newer');
  assert.match(run(sb.dir, ['context', task.meta.id, '--brief']).out, /SHORT-NOW/);
});

test('why over several files ranks the tasks across them; one file keeps its full story', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const a = createTask(store, { title: 'Touched both' });
  addStep(store, reload(store, a), { summary: 'A-OUTCOME', files: ['src/x.ts', 'src/y.ts'] });
  const b = createTask(Store.open(), { title: 'Touched one' });
  addStep(Store.open(), reload(Store.open(), b), { summary: 'B-OUTCOME', files: ['src/y.ts'] });

  const many = run(sb.dir, ['why', 'src/x.ts', 'src/y.ts']);
  assert.equal(many.code, 0, many.err);
  assert.match(many.out, /Tasks in this code, strongest first/);
  assert.ok(many.out.indexOf('Touched both') < many.out.indexOf('Touched one'), 'more (and rarer) shared files first');
  const json = JSON.parse(run(sb.dir, ['why', 'src/x.ts', 'src/y.ts', '--json']).out);
  assert.deepEqual(json.related.map((r) => r.title), ['Touched both', 'Touched one']);

  const one = run(sb.dir, ['why', 'src/x.ts']).out;
  assert.match(one, /Changed by 1 task/);
  assert.match(one, /A-OUTCOME/);
  // muscle memory from `related --files`
  assert.match(run(sb.dir, ['why', '--files', 'src/x.ts,src/y.ts']).out, /Tasks in this code/);
});

test('MCP: dolly_why replaces dolly_related; dolly_task_show folded into dolly_context', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const a = createTask(store, { title: 'Over MCP' });
  addStep(store, reload(store, a), { summary: 'MCP-OUTCOME', files: ['src/m.ts'] });
  const msgs = [
    { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'dolly_why', arguments: { files: ['src/m.ts'] } } },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'dolly_spec_update', arguments: { ref: a.meta.id, title: 'Renamed over MCP' } } },
  ];
  const r = spawnSync(process.execPath, [CLI, 'mcp'], {
    cwd: sb.dir,
    input: `${msgs.map((m) => JSON.stringify(m)).join('\n')}\n`,
    encoding: 'utf8',
    env: { ...process.env, DOLLY_USER: 'tester' },
  });
  const [list, whyReply, spec] = r.stdout.trim().split('\n').map((l) => JSON.parse(l));
  const names = list.result.tools.map((x) => x.name);
  assert.ok(names.includes('dolly_why') && names.includes('dolly_dream'));
  assert.ok(!names.includes('dolly_related') && !names.includes('dolly_task_show'));
  assert.match(whyReply.result.content[0].text, /MCP-OUTCOME/);
  assert.match(spec.result.content[0].text, /retitled "Renamed over MCP"/);
});
