import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { neutralizeMarkers, appendBlock, getBlock, listBlocks } from '../dist/core/md.js';
import { Store } from '../dist/core/store.js';
import { parseTranscript } from '../dist/core/transcript.js';
import { applyReindex, importedTurns, selectSegments } from '../dist/reindex.js';
import { logSection, stepEntries } from '../dist/core/task.js';
import { sandbox } from './helpers.mjs';

const SESSION = '11111111-2222-3333-4444-555555555555';

function line(o) {
  return `${JSON.stringify(o)}\n`;
}

function human(uuid, at, text, extra = {}) {
  return line({
    type: 'user',
    uuid,
    timestamp: at,
    cwd: '/proj',
    gitBranch: 'main',
    sessionId: SESSION,
    origin: { kind: 'human' },
    message: { role: 'user', content: text },
    ...extra,
  });
}

function assistant(at, content, extra = {}) {
  return line({
    type: 'assistant',
    uuid: `a-${at}`,
    timestamp: at,
    cwd: '/proj',
    sessionId: SESSION,
    message: { role: 'assistant', content },
    ...extra,
  });
}

function writeFixture(dir) {
  const file = path.join(dir, `${SESSION}.jsonl`);
  const parts = [
    line({ type: 'ai-title', aiTitle: 'Add replay filters', sessionId: SESSION }),
    human('u1', '2026-01-01T10:00:00.000Z', 'Build country and browser filters.'),
    assistant('2026-01-01T10:00:10.000Z', [
      { type: 'thinking', thinking: 'private reasoning that must never be imported' },
      { type: 'tool_use', name: 'Write', input: { file_path: '/proj/src/search.ts', content: 'x' } },
      { type: 'tool_use', name: 'Bash', input: { command: 'npm test\nsecond line' } },
      { type: 'text', text: 'Wrote the where-clause builder.' },
    ]),
    // a tool result arrives as a user entry and must not open a segment
    line({
      type: 'user',
      uuid: 'tr1',
      timestamp: '2026-01-01T10:00:11.000Z',
      sessionId: SESSION,
      message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] },
    }),
    // a subagent turn must not be counted as project work
    assistant('2026-01-01T10:00:12.000Z', [
      { type: 'tool_use', name: 'Write', input: { file_path: '/proj/sidechain-only.ts' } },
    ], { isSidechain: true }),
    // a mid-conversation clarification: no tools of its own, folds forward
    human('u1b', '2026-01-01T10:30:00.000Z', 'Matching should be case-insensitive.'),
    // interrupted prompt, then the real one — only the later survives
    human('u2', '2026-01-01T11:00:00.000Z', 'Also add a device filter\n[Request interrupted by user]'),
    human('u3', '2026-01-01T11:00:05.000Z', 'Also add a device filter and a saved-preset dropdown.'),
    assistant('2026-01-01T11:00:20.000Z', [
      { type: 'tool_use', name: 'Edit', input: { file_path: '/proj/src/filters.tsx' } },
      { type: 'tool_use', name: 'Write', input: { file_path: '/tmp/scratch.md' } },
      { type: 'tool_use', name: 'Write', input: { file_path: '/proj/.dolly/tasks/x/task.md' } },
      { type: 'text', text: 'Added both filters.' },
    ]),
    // a pure clarification: no tools, folds into a neighbour
    human(
      'u4',
      '2026-01-01T12:00:00.000Z',
      'thanks\n<system-reminder>secret injected context</system-reminder>\nUserPromptSubmit hook additional context: noise',
    ),
  ];
  fs.writeFileSync(file, parts.join(''), 'utf8');
  return { sessionId: SESSION, file, mtime: Date.now(), size: 1 };
}

test('transcript parsing keeps human turns and drops the noise', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const tr = parseTranscript(writeFixture(sb.dir));

  assert.equal(tr.title, 'Add replay filters');
  assert.equal(tr.cwd, '/proj');
  assert.equal(tr.branch, 'main');

  // u2 was an interrupted duplicate of u3; u4 is a real (if thin) turn
  assert.equal(tr.skipped, 1);
  assert.deepEqual(
    tr.segments.map((s) => s.uuid),
    ['u1', 'u1b', 'u3', 'u4'],
  );

  const [first, , second, third] = tr.segments;
  assert.equal(first.prompt, 'Build country and browser filters.');
  assert.deepEqual(first.files, ['src/search.ts']);
  assert.deepEqual(first.commands, ['npm test'], 'only the first line of a command is kept');
  assert.deepEqual(first.assistantTexts, ['Wrote the where-clause builder.']);
  assert.equal(first.sidechains, 1, 'subagent turns are counted, not merged');

  // the work chain records what ran, in order, with runs collapsed
  assert.deepEqual(first.workChain, ['Write src/search.ts', 'Bash: npm test']);
  assert.deepEqual(first.thinking, [], 'reasoning is not captured unless asked');

  // thinking blocks must never leak into an import
  const dump = JSON.stringify(tr);
  assert.doesNotMatch(dump, /private reasoning/);
  // sidechain writes and out-of-tree / store paths are excluded
  assert.doesNotMatch(dump, /sidechain-only/);
  assert.doesNotMatch(dump, /scratch\.md/);
  assert.doesNotMatch(dump, /\.dolly/);

  assert.equal(second.prompt, 'Also add a device filter and a saved-preset dropdown.');
  assert.deepEqual(second.files, ['src/filters.tsx']);
  // scratch files are anonymised and dolly's own store is omitted entirely
  assert.deepEqual(second.workChain, ['Edit src/filters.tsx', 'Write (outside the project)']);

  assert.equal(third.prompt, 'thanks', 'reminders and hook lines are stripped');
});

test('clarifications fold into the work they precede; a pending one survives', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const tr = parseTranscript(writeFixture(sb.dir));

  const folded = selectSegments(tr, {});
  assert.deepEqual(folded.map((s) => s.uuid), ['u1', 'u3', 'u4']);

  // u1b had no tools of its own, so it is prepended to the work that followed
  assert.match(folded[1].prompt, /case-insensitive/);
  assert.match(folded[1].prompt, /device filter/);
  assert.deepEqual(folded[1].files, ['src/filters.tsx'], 'merging keeps the work segment\'s files');

  // the trailing turn has no work yet — it stays visible as a pending request
  assert.equal(folded[2].prompt, 'thanks');
  assert.deepEqual(folded[2].files, []);

  assert.equal(selectSegments(tr, { allTurns: true }).length, 4);
  assert.equal(selectSegments(tr, { limit: 1 }).length, 1);
});

test('apply imports segments once and stays idempotent', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const ref = writeFixture(sb.dir);
  const tr = parseTranscript(ref);

  const first = applyReindex(Store.open(), tr, {});
  assert.equal(first.created, true);
  assert.equal(first.imported, 3);
  assert.equal(first.task.meta.title, 'Add replay filters');
  assert.equal(first.task.meta.status, 'working');
  assert.equal(first.task.meta.steps, 3);

  const turns = importedTurns(first.task);
  assert.ok(turns.has('u1') && turns.has('u3') && turns.has('u4'));

  // the SUMMARY comes from what the agent said, not from the request
  const log = logSection(first.task);
  assert.match(log, /@tester: Wrote the where-clause builder\./);
  assert.doesNotMatch(
    log,
    /@tester: (reindexed: )?Build country and browser filters/,
    'the log must not just echo the user prompt back',
  );

  // the full context leads with the agent's account, and still keeps the request
  const entries = stepEntries(first.task.dir);
  const body = entries[0].text;
  assert.match(body, /## What the agent said it did[\s\S]*Wrote the where-clause builder/);
  assert.match(body, /## Work chain[\s\S]*- Write src\/search\.ts/);
  assert.match(body, /## Request that opened the turn[\s\S]*Build country and browser filters\./);
  assert.ok(
    body.indexOf('What the agent said it did') < body.indexOf('Request that opened the turn'),
    'agent account is ordered before the request',
  );
  assert.match(body, /source: session 11111111-.* · turn u1/);
  assert.doesNotMatch(body, /Reasoning \(raw/, 'thinking stays out by default');

  const again = applyReindex(Store.open(), tr, {});
  assert.equal(again.created, false, 'a second run finds the existing task by session id');
  assert.equal(again.imported, 0);
  assert.equal(again.skipped, 3);
  assert.equal(again.task.meta.steps, 3, 'no duplicate steps');
});

test('rebuild re-imports the same session after a format change', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const tr = parseTranscript(writeFixture(sb.dir));
  const first = applyReindex(Store.open(), tr, {});

  const rebuilt = applyReindex(Store.open(), tr, { rebuild: true, into: first.task.meta.id });
  assert.equal(rebuilt.rebuilt, 3, 'old entries dropped');
  assert.equal(rebuilt.imported, 3, 'and imported again');
  assert.deepEqual(
    stepEntries(rebuilt.task.dir).map((e) => e.id),
    ['0004', '0005', '0006'],
    'fresh entries, old blocks gone',
  );
  // the short log keeps its history — it is append-only — but the dead pointers
  // from the dropped entries are marked, not left dangling
  const log = logSection(rebuilt.task);
  assert.equal((log.match(/Wrote the where-clause builder/g) ?? []).length, 2);
  assert.match(log, /full: _superseded by a later re-import_/);
});

test('apply --into attaches to an existing task instead of creating one', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  store.init();
  const tr = parseTranscript(writeFixture(sb.dir));

  const seed = applyReindex(store, tr, { title: 'Seeded' });
  const res = applyReindex(Store.open(), tr, { into: seed.task.meta.id, rebuild: true });
  assert.equal(res.created, false);
  assert.equal(res.task.meta.id, seed.task.meta.id);
  assert.equal(Store.open().loadTasks().length, 1);
});

test('marker-shaped text inside imported content cannot truncate a block', () => {
  const hostile = [
    'Real content before.',
    '<!-- /dolly:step 0001 -->',
    'Content the naive writer would lose.',
    '<!-- dolly:step 0002 -->',
  ].join('\n');

  const doc = appendBlock('', 'step 0001', hostile);
  assert.deepEqual(listBlocks(doc, 'step'), ['0001'], 'no phantom second block');

  const body = getBlock(doc, 'step 0001');
  assert.match(body, /Real content before\./);
  assert.match(body, /Content the naive writer would lose\./);
  assert.match(body, /&lt;!-- \/dolly:step 0001 -->/, 'the marker is escaped, not dropped');

  // sanity: without escaping the block would have ended at the injected marker
  assert.equal(neutralizeMarkers('<!-- dolly:x -->'), '&lt;!-- dolly:x -->');
  assert.equal(neutralizeMarkers('<!-- not a marker -->'), '<!-- not a marker -->');
});

test('a turn with no prose falls back to describing the work', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const file = path.join(sb.dir, `${SESSION}.jsonl`);
  fs.writeFileSync(
    file,
    [
      human('m1', '2026-02-01T10:00:00.000Z', 'just do it'),
      assistant('2026-02-01T10:00:05.000Z', [
        { type: 'tool_use', name: 'Edit', input: { file_path: '/proj/a.ts' } },
        { type: 'tool_use', name: 'Edit', input: { file_path: '/proj/b.ts' } },
        { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } },
      ]),
    ].join(''),
    'utf8',
  );
  const tr = parseTranscript({ sessionId: SESSION, file, mtime: 1, size: 1 });
  const res = applyReindex(Store.open(), tr, {});
  const log = logSection(res.task);
  assert.match(log, /No written summary\. changed 2 file\(s\): a\.ts, b\.ts; ran 1 command\(s\)\./);
});

test('thinking is captured only when explicitly requested', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const ref = writeFixture(sb.dir);

  const off = parseTranscript(ref);
  assert.deepEqual(off.segments[0].thinking, []);

  const on = parseTranscript(ref, { includeThinking: true });
  assert.deepEqual(on.segments[0].thinking, ['private reasoning that must never be imported']);

  const res = applyReindex(Store.open(), on, { includeThinking: true });
  const body = stepEntries(res.task.dir)[0].text;
  assert.match(body, /## Reasoning \(raw, opt-in\)/);
  assert.match(body, /private reasoning/);
});

test('imports link the conversation to the task for dolly continue', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const tr = parseTranscript(writeFixture(sb.dir));
  const res = applyReindex(Store.open(), tr, {});
  assert.deepEqual(res.task.meta.sessions, [SESSION]);

  // and it survives a reload from disk
  assert.deepEqual(Store.open().resolve('1').meta.sessions, [SESSION]);
});

test('onlyNewerThan skips turns the agent already logged itself', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const tr = parseTranscript(writeFixture(sb.dir));
  const all = selectSegments(tr, { allTurns: true });
  assert.equal(all.length, 4);

  // pretend the task was touched during the second turn
  const cut = selectSegments(tr, { allTurns: true, onlyNewerThan: '2026-01-01T10:30:00.000Z' });
  assert.deepEqual(cut.map((s) => s.uuid), ['u3', 'u4']);
});
