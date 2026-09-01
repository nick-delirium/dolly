import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { buildDigest, eventsOn, renderDigest, today } from '../dist/core/memo.js';
import { Store } from '../dist/core/store.js';
import { addStep, createTask, setStatus } from '../dist/core/task.js';
import { ageTask, daysAgo, sandbox } from './helpers.mjs';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');

// direct core/ calls resolve identity from the environment — pin it
process.env.DOLLY_USER = 'tester';

function dolly(cwd, args, env = {}, input) {
  return execFileSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    input,
    env: { ...process.env, DOLLY_USER: 'tester', NO_COLOR: '1', ...env },
  });
}

/** one mirrored opencode turn stamped right now */
function mirrorTurn(prompt) {
  return JSON.stringify({
    index: 1,
    uuid: `msg-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    prompt,
    files: ['src/thing.ts'],
    commands: [],
    tools: { edit: 1 },
    assistantTexts: ['did the thing'],
    workChain: ['Edit thing.ts'],
  });
}

test('digest carries today’s task events and leaves yesterday out', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  // pin both transcript roots at empty dirs: deleting them points the digest at
  // the developer's real ~/.claude/projects, whose prompts then land in
  // renderDigest() and are matched against by the assertions below
  process.env.DOLLY_OPENCODE_DIR = path.join(sb.dir, 'mirror');
  process.env.DOLLY_TRANSCRIPT_DIR = path.join(sb.dir, 'claude-transcripts');
  const store = Store.open();
  store.init();
  const task = createTask(store, { title: 'Memoized' });
  setStatus(store, task, 'working');
  addStep(store, task, { summary: 'fresh work', detail: 'context', files: ['src/a.ts'] });

  const old = createTask(store, { title: 'Aged work' });
  setStatus(store, old, 'done');
  ageTask(old.dir, daysAgo(3));
  // rewind the LOG stamps too — ageTask only touches frontmatter
  const oldFile = path.join(old.dir, 'task.md');
  fs.writeFileSync(
    oldFile,
    fs.readFileSync(oldFile, 'utf8').replaceAll(`- \`${today()}`, `- \`${daysAgo(3)}`),
  );

  const d = buildDigest(store, today());
  assert.deepEqual(d.tasks.map((x) => x.task.meta.id), [task.meta.id], 'only today shows');
  assert.ok(d.tasks[0].events.some((e) => e.text.includes('status todo → working')));
  assert.match(renderDigest(d), /fresh work/);
  assert.doesNotMatch(renderDigest(d), /Aged work/);

  // backfill window: nothing on that day reads as empty, not broken
  const empty = buildDigest(store, daysAgo(10).slice(0, 10));
  assert.equal(empty.tasks.length, 0);
  assert.match(renderDigest(empty), /no task events recorded this day/);
});

test('eventsOn parses the short-log format and filters by date', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  store.init();
  const task = createTask(store, { title: 'Parse me' });
  addStep(store, task, { summary: 'a step', detail: 'body' });
  const events = eventsOn(task, today());
  assert.equal(events.length, 1, 'createTask stamps only frontmatter; steps log');
  assert.ok(events.every((e) => e.user === 'tester'));
  assert.ok(events[0].text.includes('a step'));
});

test('digest includes mirrored opencode turns from the day', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  process.env.DOLLY_OPENCODE_DIR = path.join(sb.dir, 'mirror');
  // sandbox() pins the STORE but not the cwd, so store.project is this repo —
  // and ~/.claude/projects holds today's transcripts for it. Pin the Claude
  // Code root at an empty dir or the developer's own session counts as a
  // conversation and this assertion fails on their machine but not in CI.
  process.env.DOLLY_TRANSCRIPT_DIR = path.join(sb.dir, 'claude-transcripts');
  // the mirror is keyed by the PROJECT cwd (an env-pinned store still describes
  // the directory the CLI ran in)
  const store = Store.open();
  store.init();
  const dir = path.join(
    process.env.DOLLY_OPENCODE_DIR,
    store.project.replace(/[^a-zA-Z0-9]/g, '-'),
  );
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ses_memotest1.jsonl'), `${mirrorTurn('wrote the memo feature')}\n`);

  const d = buildDigest(store, today());
  assert.equal(d.conversations.length, 1);
  assert.equal(d.conversations[0].turns, 1);
  assert.deepEqual(d.conversations[0].files, ['src/thing.ts']);
  assert.match(renderDigest(d), /wrote the memo feature/);
});

test('the digest reports files even when the step summary spans several lines', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  process.env.DOLLY_OPENCODE_DIR = path.join(sb.dir, 'mirror');
  process.env.DOLLY_TRANSCRIPT_DIR = path.join(sb.dir, 'claude-transcripts');
  const store = Store.open();
  store.init();
  const task = createTask(store, { title: 'Multi line' });

  // logLine() writes continuation lines first and trailers last, so a two-line
  // summary pushes `files:` down to the third line of the entry
  addStep(store, task, {
    summary: 'first line of the outcome\nsecond line with the why',
    detail: 'body',
    files: ['src/deep.ts'],
  });

  const rendered = renderDigest(buildDigest(store, today()));
  assert.match(rendered, /`src\/deep\.ts`/, 'the trailer is below the continuation line, not on it');
});

test('memo --save writes .dolly/memo/<date>.md; empty prose is refused', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();

  dolly(sb.dir, ['memo', '--save', '--file', '-'], { DOLLY_DIR: sb.store }, 'worked on memo\nall day\n');
  const file = path.join(sb.store, 'memo', `${today()}.md`);
  assert.equal(fs.readFileSync(file, 'utf8'), 'worked on memo\nall day\n');

  // re-saving overwrites — corrections are normal
  dolly(sb.dir, ['memo', '--save', '--file', '-'], { DOLLY_DIR: sb.store }, 'better text');
  assert.equal(fs.readFileSync(file, 'utf8'), 'better text\n');

  assert.throws(
    () => dolly(sb.dir, ['memo', '--save', '--file', '-'], { DOLLY_DIR: sb.store }, '   \n'),
    /empty/,
  );
});

test('memo.auto surfaces a session-start hint only while today has no memo', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  dolly(sb.dir, ['config', 'set', 'memo.auto', 'true'], { DOLLY_DIR: sb.store });

  const without = dolly(sb.dir, ['hook', 'session-start'], { DOLLY_DIR: sb.store });
  assert.match(without, /No memo for today yet/);

  dolly(sb.dir, ['memo', '--save', '--file', '-'], { DOLLY_DIR: sb.store }, 'the day in brief');
  const withMemo = dolly(sb.dir, ['hook', 'session-start'], { DOLLY_DIR: sb.store });
  assert.doesNotMatch(withMemo, /No memo for today yet/, 'existing memo silences the hint');
});
