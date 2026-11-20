// What dolly puts into an agent's context, and how much of it. Every byte here
// is paid on every session (block, skill descriptions, session-start) or every
// task pickup (dolly context), so the budgets are asserted, not hoped for.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { renderContext, compactStep } from '../dist/core/render.js';
import { Store } from '../dist/core/store.js';
import { addStep, createTask, reload, setStatus, updateSpec } from '../dist/core/task.js';
import { finalizePlan, setPlanSection, startPlan } from '../dist/core/plan.js';
import { AGENT_BLOCK } from '../dist/templates/instructions.js';
import { setProjectSection } from '../dist/core/project.js';
import { ageTask, sandbox } from './helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'dist', 'cli.js');
const run = (cwd, args, input) =>
  spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    input,
    encoding: 'utf8',
    env: { ...process.env, DOLLY_USER: 'tester', NO_COLOR: '1' },
  }).stdout;

test('the always-loaded instruction block stays small and points at the full guide', () => {
  assert.ok(AGENT_BLOCK.length <= 2000, `block is ${AGENT_BLOCK.length} bytes`);
  for (const must of ['dolly context', 'dolly step', 'validating', 'dolly guide', 'dolly-planning', 'dolly status <ref> working']) {
    assert.ok(AGENT_BLOCK.includes(must), must);
  }
});

test('skill descriptions — listed in every session — stay short', () => {
  for (const name of ['dolly', 'dolly-planning']) {
    const raw = fs.readFileSync(path.join(ROOT, 'skills', name, 'SKILL.md'), 'utf8');
    const desc = /^description: >\n([\s\S]*?)\n---/m.exec(raw)[1].replace(/\s+/g, ' ').trim();
    assert.ok(desc.length <= 320, `${name}: ${desc.length} chars`);
  }
});

test('dolly guide prints the skill text, no frontmatter', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const guide = run(sb.dir, ['guide']);
  assert.doesNotMatch(guide, /^---/);
  assert.match(guide, /Log every major step/);
  assert.match(run(sb.dir, ['guide', 'planning']), /dolly plan check/);
});

test('the MCP tool list stays under budget', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const out = run(sb.dir, ['mcp'], `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })}\n`);
  const tools = JSON.parse(out).result.tools;
  assert.ok(JSON.stringify(tools).length < 8000, `${JSON.stringify(tools).length} bytes`);
  assert.ok(tools.every((x) => x.description.length <= 200), 'one-line descriptions');
});

test('context: a finalized plan and the spec’s copy of the criteria are not repeated', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = startPlan(store, 'Planned thing', 'the brief');
  for (const [sec, text] of [
    ['Problem', 'it hurts'], ['Goal', 'it stops'], ['Scope', 'In: a\nOut: b'],
    ['Success Criteria', '- [ ] PLANNED-CRITERION'], ['Changes', 'src/a.ts'],
    ['Risks', 'none'], ['Test Plan', 'unit'], ['Open Questions', '- [x] none left'],
  ]) setPlanSection(store, task, sec, text);
  finalizePlan(store, reload(store, task));
  const done = reload(store, task);

  const ctx = renderContext(done, { store });
  assert.doesNotMatch(ctx, /^## Plan$/m, 'the plan became the spec');
  assert.match(ctx, /context\/plan\.md/, 'but it is pointed at');
  assert.equal(ctx.split('PLANNED-CRITERION').length - 1, 1, 'criteria appear once');
  assert.match(ctx, /it hurts/, 'the spec itself is there');

  setStatus(store, done, 'planning');
  assert.match(renderContext(reload(store, done), { store }), /^## Plan$/m, 'while planning, the plan is the source');
});

test('context: an auto-logged step keeps what the agent said, not its tool trace', () => {
  const auto = [
    '## 0003 · 2026-01-01T00:00:00Z · @x',
    '',
    '- task status: working',
    '',
    '## What the agent said it did',
    '',
    'Swapped the scan for a map.',
    '',
    '## Blockers',
    '',
    'none — this heading is the agent’s own, not the importer’s',
    '',
    '## Work chain',
    '',
    '- Bash: npm test',
    '',
    '## Commands run',
    '',
    '- `npm test`',
    '',
    '## Tools: Bash 1',
    '',
    '## Request that opened the turn (verbatim)',
    '',
    'make it fast',
  ].join('\n');
  const out = compactStep(auto);
  assert.match(out, /Swapped the scan/);
  assert.match(out, /this heading is the agent’s own/);
  assert.match(out, /make it fast/);
  assert.doesNotMatch(out, /Work chain|Commands run|Tools:/);
  const written = '## 0004 · 2026 · @x\n\n## Decisions\n\nkept whole';
  assert.equal(compactStep(written), '## 0004 · 2026 · @x\n\n### Decisions\n\nkept whole');
});

test('context: the short log keeps the newest 20 entries, without trailers', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Long history' });
  for (let i = 1; i <= 25; i++) addStep(store, task, { summary: `entry-${i}`, files: ['src/x.ts'] });
  const ctx = renderContext(reload(store, task), { store });
  const log = ctx.slice(ctx.indexOf('## Step log'));
  assert.doesNotMatch(log, /entry-5\b/);
  assert.match(log, /entry-25\b/);
  assert.match(log, /_5 earlier entries/);
  const brief = renderContext(reload(store, task), { store, brief: true });
  assert.match(brief.slice(brief.indexOf('## Step log')), /_15 earlier entries/, 'the brief view keeps 10');
  assert.doesNotMatch(log, /files: `src\/x\.ts`/, 'files are listed once, above');
});

test('session-start names one task, and injects it in full only when it is this conversation’s or fresh', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Quiet', specShort: 'SPEC-TEXT' });
  setStatus(store, task, 'working');
  const file = path.join(task.dir, 'task.md');
  const age = (iso) => ageTask(task.dir, iso);
  age(new Date(Date.now() - 10 * 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z'));
  const ctx = run(sb.dir, ['hook', 'session-start', '--raw'], '{}');
  assert.match(ctx, /Most recent open task: \S+ "Quiet"/);
  assert.doesNotMatch(ctx, /SPEC-TEXT/, 'a week+ old and not ours: a pointer, not the spec');
  assert.doesNotMatch(ctx, /Success Criteria/);
  age('2020-01-01T00:00:00Z');
  const idle = run(sb.dir, ['hook', 'session-start', '--raw'], '{}');
  assert.doesNotMatch(idle, /Quiet/, 'idle past staleDays: not offered at all');
  assert.match(idle, /1 idle over 14d/);
  updateSpec(store, reload(store, task), { short: 'SPEC-TEXT-2' }); // fresh again
  assert.match(run(sb.dir, ['hook', 'session-start', '--raw'], '{}'), /SPEC-TEXT-2/);
});

test('the brief view is the short read: no project brief, no full spec; the full read drops the Overview session start already gave', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  setProjectSection(store, 'Overview', 'OVERVIEW-TEXT');
  setProjectSection(store, 'Invariants', 'INVARIANT-TEXT');
  const task = createTask(store, { title: 'Sized', specShort: 'SHORT-SPEC', specFull: `# Full\n\nFULL-SPEC ${'x'.repeat(4000)}` });
  addStep(store, reload(store, task), { summary: 'did a thing', detail: 'DETAIL' });

  const brief = renderContext(reload(store, task), { store, brief: true });
  const full = renderContext(reload(store, task), { store });
  for (const s of ['OVERVIEW-TEXT', 'INVARIANT-TEXT', 'FULL-SPEC', 'DETAIL']) assert.doesNotMatch(brief, new RegExp(s));
  assert.match(brief, /SHORT-SPEC/);
  assert.match(brief, /come without `--brief`/);
  assert.ok(brief.length < full.length / 3, `brief ${brief.length} vs full ${full.length}`);
  assert.doesNotMatch(full, /OVERVIEW-TEXT/, 'session start injects the Overview');
  for (const s of ['INVARIANT-TEXT', 'FULL-SPEC', 'DETAIL']) assert.match(full, new RegExp(s));
});

test('the full context carries the newest Lessons within a budget; the brief view carries none', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const lessons = Array.from({ length: 30 }, (_, i) => `- LESSON-${i}: ${'x'.repeat(60)}`).join('\n');
  setProjectSection(store, 'Lessons', lessons);
  setProjectSection(store, 'Architecture', 'ARCH');
  const task = createTask(store, { title: 'Learns' });
  const full = renderContext(reload(store, task), { store });
  const lessonsPart = full.slice(full.indexOf('### Lessons'));
  assert.match(lessonsPart, /LESSON-29:/, 'the newest lesson is always there');
  assert.doesNotMatch(lessonsPart, /LESSON-0:/, 'the oldest give way to the budget');
  assert.match(lessonsPart, /_\d+ older lessons — `dolly project`\._/);
  assert.ok(lessonsPart.length < 1200, `${lessonsPart.length} bytes`);
  assert.match(full, /_Also in the brief: Architecture — `dolly project`\._/, 'the pointer still names the rest, minus Lessons');
  assert.doesNotMatch(renderContext(reload(store, task), { store, brief: true }), /LESSON-/);
});

test('session start: "Last:" is the newest step’s outcome, never a files trailer', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Recent' });
  setStatus(store, reload(store, task), 'working');
  addStep(store, reload(store, task), { summary: 'OUTCOME-LINE', files: ['src/a.ts', 'src/b.ts'], detail: 'd' });
  const ctx = run(sb.dir, ['hook', 'session-start', '--raw'], '{}');
  assert.match(ctx, /^Last: OUTCOME-LINE$/m);
  assert.doesNotMatch(ctx, /^Last:\s+files:/m);
});

test('why on a hub file shows the newest tasks and counts the rest', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  for (let i = 0; i < 10; i++) {
    const task = createTask(Store.open(), { title: `Hub task ${i}` });
    addStep(Store.open(), reload(Store.open(), task), { summary: `S${i}-a`, files: ['src/hub.ts'] });
    addStep(Store.open(), reload(Store.open(), task), { summary: `S${i}-b`, files: ['src/hub.ts'] });
  }
  const out = run(sb.dir, ['why', 'src/hub.ts'], '');
  assert.match(out, /Changed by 10 task\(s\)/);
  assert.equal((out.match(/^- \S+ Hub task/gm) ?? []).length, 6);
  assert.match(out, /\+4 older task\(s\) — `--json` lists every one/);
  assert.doesNotMatch(out, /S\d-a/, 'one newest step per task once it is a hub');
});
