// dolly dream: material since the last dream, append-only saves, Lessons into
// the brief and nothing else, weekly rollups, the one session-start line.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  dayMaterial,
  dreamLine,
  dueWeek,
  isoWeek,
  lastDayDream,
  listDreams,
  saveDream,
  weekMaterial,
} from '../dist/core/dream.js';
import { addPlanQA, startPlan } from '../dist/core/plan.js';
import { readProject, setProjectSection } from '../dist/core/project.js';
import { recall } from '../dist/core/recall.js';
import { Store } from '../dist/core/store.js';
import { addStep, createTask, reload, updateSpec } from '../dist/core/task.js';
import { sandbox } from './helpers.mjs';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');

/** a sandbox whose transcript roots are empty: the developer's own sessions must not leak in */
function box(t) {
  const sb = sandbox();
  t.after(sb.cleanup);
  process.env.DOLLY_TRANSCRIPT_DIR = path.join(sb.dir, 'claude-transcripts');
  process.env.DOLLY_OPENCODE_DIR = path.join(sb.dir, 'opencode');
  return sb;
}

function run(cwd, args, { input, env = {} } = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    input,
    encoding: 'utf8',
    env: { ...process.env, DOLLY_USER: 'tester', NO_COLOR: '1', ...env },
  });
  return { out: r.stdout ?? '', err: r.stderr ?? '', code: r.status };
}

const stamp = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

const DREAM = `### What happened
- Shipped the token fix (\`abc12345\`).

### Decisions
- Kept the lock per store, not per task: one writer is simpler.

### Went wrong
- The fixture lied about cwd.

### Lessons
- Run the suite under a throwaway home — tests leaked into ~/.dolly once.

### Proposed brief edits
- Invariants: add "one writer per store".
`;

test('ISO weeks, including the year boundary', () => {
  assert.equal(isoWeek('2026-11-20'), '2026-W47');
  assert.equal(isoWeek('2026-12-31'), '2026-W53');
  assert.equal(isoWeek('2027-01-01'), '2026-W53', 'Jan 1st on a Friday belongs to the old year');
  assert.equal(isoWeek('2024-12-30'), '2025-W01', 'Dec 30th on a Monday starts the new year');
});

test('the material carries the window: events, agent notes ahead of auto-steps, plan answers, the brief', (t) => {
  box(t);
  const store = Store.open();
  store.init();
  setProjectSection(store, 'Invariants', 'INVARIANT-NOW');
  const task = createTask(store, { title: 'Token fix' });
  addStep(store, reload(store, task), { summary: 'Fixed the comparison.', detail: '### Decisions\nAGENT-NOTE' });
  addStep(store, reload(store, task), {
    summary: 'auto turn',
    detail: 'AUTO-BODY',
    source: 'session s1 · turn t1',
  });
  updateSpec(store, reload(store, task), { short: 'new', full: 'full', reason: 'scope grew' });

  const planned = startPlan(store, 'Planned thing', 'brief');
  addPlanQA(store, reload(store, planned), 'GeoIP or profile?', 'GeoIP — already stored.');

  const m = dayMaterial(store);
  assert.match(m.text, /plan answer: \*\*GeoIP or profile\?\*\* → GeoIP — already stored\./);
  assert.match(m.text, /Fixed the comparison/);
  assert.match(m.text, /AGENT-NOTE/);
  assert.match(m.text, /spec → v2\. scope grew/);
  assert.match(m.text, /INVARIANT-NOW/, 'the brief comes along');
  assert.match(m.text, new RegExp(`--through ${m.through}`));
  assert.deepEqual(m.tasks.sort(), [task.meta.id, planned.meta.id].sort());

  // a tight cap drops the auto-logged body before the agent's own note
  const tight = dayMaterial(store, { cap: m.text.length - 20 });
  assert.match(tight.text, /AGENT-NOTE/);
  assert.doesNotMatch(tight.text, /AUTO-BODY/);
  assert.ok(tight.cut > 0);
  assert.match(tight.text, /left out to stay under/);
});

test('saving appends, starts the next window at --through, and refuses a stale save', (t) => {
  box(t);
  const store = Store.open();
  store.init();
  const task = createTask(store, { title: 'Windowed' });
  addStep(store, reload(store, task), { summary: 'BEFORE-DREAM' });
  const m = dayMaterial(store);
  const saved = saveDream(store, DREAM, { through: m.through });
  assert.equal(lastDayDream(store).through, m.through);
  assert.match(fs.readFileSync(saved.file, 'utf8'), /Kept the lock per store/);
  assert.match(fs.readFileSync(saved.file, 'utf8'), /^### Decisions$/m, 'the dream keeps its ### headings under the block header');

  // the same minute may show again (never dropped); a minute later is new work
  const later = Date.parse(m.through) + 120_000;
  const next = dayMaterial(store, { now: later });
  assert.equal(next.from, m.through);

  // a second save on the same day is a second block; the first stays byte-identical
  const first = fs.readFileSync(saved.file, 'utf8');
  saveDream(store, '### What happened\n- SECOND', { through: stamp(later) });
  const both = fs.readFileSync(saved.file, 'utf8');
  assert.ok(both.startsWith(first.trimEnd()), 'append-only');
  assert.equal(listDreams(store).length, 2);

  assert.throws(() => saveDream(store, '- x', { through: m.through }), /already covers/);
  assert.throws(() => saveDream(store, '- x', { through: '' }), /needs --through/);
  assert.throws(() => saveDream(store, '   ', { through: stamp(later + 60_000) }), /empty dream/);
});

test('a dream only APPENDS Lessons to the brief; every other edit is a proposal', (t) => {
  box(t);
  const store = Store.open();
  store.init();
  setProjectSection(store, 'Invariants', 'ORIGINAL-INVARIANTS');
  setProjectSection(store, 'Lessons', '- Run the suite under a throwaway home — tests leaked into ~/.dolly once.');
  const m = dayMaterial(store);
  const r = saveDream(store, `${DREAM}- Lessons: add "Log before a risky refactor".\n\n### Lessons\n- Log before a risky refactor.\n`, { through: m.through });

  assert.deepEqual(r.lessons, ['Log before a risky refactor.'], 'a lesson the brief already has is not repeated');
  assert.equal(r.proposals.length, 2);
  const brief = readProject(store);
  assert.match(brief, /ORIGINAL-INVARIANTS/);
  assert.doesNotMatch(brief, /one writer per store/, 'the proposal was NOT applied');
  assert.match(brief, /- Log before a risky refactor\./);
  assert.equal(brief.match(/throwaway home/g).length, 1);
});

test('week rollups: due after the week ends, material from its days, saved to YYYY-Www.md', (t) => {
  box(t);
  const store = Store.open();
  store.init();
  // two day dreams in W47 (Mon 16th, Wed 18th of Nov 2026)
  saveDream(store, '### What happened\n- MONDAY-WORK', { through: '2026-11-16T12:00:00Z' });
  saveDream(store, '### What happened\n- WEDNESDAY-WORK', { through: '2026-11-18T12:00:00Z' });
  assert.equal(dueWeek(store, Date.parse('2026-11-19T12:00:00Z')), null, 'the week is not over');
  assert.equal(dueWeek(store, Date.parse('2026-11-24T12:00:00Z')), '2026-W47');

  const m = weekMaterial(store, '2026-W47', { now: Date.parse('2026-11-24T12:00:00Z') });
  assert.match(m.text, /MONDAY-WORK/);
  assert.match(m.text, /WEDNESDAY-WORK/);
  const r = saveDream(store, '### What the week did\n- BOTH', { through: m.through, week: '2026-W47' });
  assert.equal(path.basename(r.file), '2026-W47.md');
  assert.equal(dueWeek(store, Date.parse('2026-11-24T12:00:00Z')), null, 'rolled up');
  assert.throws(() => weekMaterial(store, '2026-W40'), /no day dreams/);
});

test('session start gets ONE dream line: the nudge when due, the pointer after', (t) => {
  box(t);
  const store = Store.open();
  store.init();
  const task = createTask(store, { title: 'Busy' });
  addStep(store, reload(store, task), { summary: 'did work' });
  const tasks = () => Store.open().loadTasks();
  const now = Date.now();

  assert.equal(dreamLine(store, tasks(), now), '', 'fresh work, never dreamt, under a day old: quiet');
  const dayLater = now + 25 * 3_600_000;
  const due = dreamLine(store, tasks(), dayLater);
  assert.match(due, /Undreamt work/);
  assert.equal(due.split('\n').length, 1);

  saveDream(store, DREAM, { through: stamp(now) });
  const after = dreamLine(Store.open(), tasks(), now + 60_000);
  assert.match(after, /Last dream today \(1 brief edit proposed\) — `dolly dream show`/);
  assert.doesNotMatch(after, /Undreamt/);

  assert.equal(dreamLine({ ...Store.open(), config: { ...store.config, dream: { nudge: false } }, root: store.root }, tasks(), dayLater * 2).includes('Undreamt'), false);
});

test('recall finds dreams, and --kind decision hits their Decisions and Lessons', (t) => {
  box(t);
  const store = Store.open();
  store.init();
  saveDream(store, DREAM, { through: stamp(Date.now()) });
  const hit = recall([store], 'lock per store').hits[0];
  assert.equal(hit.kind, 'dream');
  assert.match(hit.label, /^dream \d{4}-\d{2}-\d{2}$/);
  assert.ok(recall([store], 'throwaway home', { kinds: ['decision'] }).hits.some((h) => h.kind === 'dream'));
  assert.ok(recall([store], 'lock', { kinds: ['memo'] }).hits.length, 'the old kind name still works');
});

test('CLI: material, save from stdin, show, list; memo and digest point at dream', (t) => {
  const sb = box(t);
  const store = Store.open();
  store.init();
  createTask(store, { title: 'Via CLI' });

  const material = run(sb.dir, ['dream']);
  assert.equal(material.code, 0, material.err);
  const through = /--through (\S+)/.exec(material.out)[1];
  const saved = run(sb.dir, ['dream', '--save', '--through', through, '--file', '-'], { input: DREAM });
  assert.equal(saved.code, 0, saved.err);
  assert.match(saved.out, /dream saved → /);
  assert.match(saved.out, /Lessons appended to the project brief \(1\)/);
  assert.match(saved.out, /Proposed brief edits — NOT applied/);
  assert.match(saved.out, /Invariants: add "one writer per store"/);

  assert.match(run(sb.dir, ['dream', 'show']).out, /Kept the lock per store/);
  assert.match(run(sb.dir, ['dream', 'list']).out, /\d{4}-\d{2}-\d{2}\s+day\s+1 dream/);
  for (const old of ['memo', 'digest']) {
    const r = run(sb.dir, [old, '--save']);
    assert.equal(r.code, 1);
    assert.match(r.err, new RegExp(`\`${old}\` was removed — use \`dolly dream\``));
  }
});

test('MCP: dolly_dream prints material and saves, echoing proposals', (t) => {
  const sb = box(t);
  Store.open().init();
  const call = (id, args) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'dolly_dream', arguments: args } });
  const rpc = (msgs) =>
    execFileSync(process.execPath, [CLI, 'mcp'], {
      cwd: sb.dir,
      input: `${msgs.map((m) => JSON.stringify(m)).join('\n')}\n`,
      encoding: 'utf8',
      env: { ...process.env, DOLLY_USER: 'tester' },
    })
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
  const [m] = rpc([call(1, {})]);
  const through = /--through (\S+)/.exec(m.result.content[0].text)[1];
  const [s] = rpc([call(2, { save: true, through, text: DREAM })]);
  assert.match(s.result.content[0].text, /proposed brief edits, NOT applied/);
});
