import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { Store } from '../dist/core/store.js';
import { createTask, logSection, setStatus, stepEntries } from '../dist/core/task.js';
import { sandbox } from './helpers.mjs';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');

/** Claude Code flattens the cwd into the transcript directory name */
const escapeCwd = (p) => p.replace(/[^a-zA-Z0-9]/g, '-');

function dolly(cwd, args, env = {}) {
  return execFileSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, DOLLY_USER: 'tester', NO_COLOR: '1', ...env },
  });
}

/** a transcript for `cwd`, discoverable via DOLLY_TRANSCRIPT_DIR */
function plantTranscript(root, cwd, sessionId, entries) {
  const dir = path.join(root, escapeCwd(cwd));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), entries.join(''), 'utf8');
  return root;
}

const line = (o) => `${JSON.stringify(o)}\n`;

function turn(uuid, at, prompt, endAt, text, files = []) {
  return [
    line({
      type: 'user',
      uuid,
      timestamp: at,
      cwd: '/unused',
      origin: { kind: 'human' },
      message: { role: 'user', content: prompt },
    }),
    line({
      type: 'assistant',
      uuid: `a-${uuid}`,
      timestamp: endAt,
      message: {
        role: 'assistant',
        content: [
          ...files.map((f) => ({ type: 'tool_use', name: 'Edit', input: { file_path: f } })),
          { type: 'text', text },
        ],
      },
    }),
  ].join('');
}

test('the Stop hook auto-logs a turn the agent never logged', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Auto logged' });
  setStatus(store, task, 'working');

  const tRoot = path.join(sb.dir, 'transcripts');
  plantTranscript(tRoot, sb.dir, 'sess-1', [
    turn(
      'turn-1',
      '2030-01-01T10:00:00.000Z',
      'make the thing faster',
      '2030-01-01T10:05:00.000Z',
      'Swapped the linear scan for a map lookup; p95 dropped from 900ms to 40ms.',
      [path.join(sb.dir, 'src/fast.ts')],
    ),
  ]);

  const out = dolly(sb.dir, ['hook', 'stop'], {
    DOLLY_DIR: sb.store,
    DOLLY_TRANSCRIPT_DIR: tRoot,
  });
  assert.match(out, /"systemMessage"/);
  assert.match(out, /auto-logged 1 step/);

  const after = Store.open().resolve('1');
  assert.equal(after.meta.steps, 1);
  // the summary is the agent's own account, not the request
  assert.match(logSection(after), /Swapped the linear scan for a map lookup/);
  assert.doesNotMatch(logSection(after), /make the thing faster/);
  // and the conversation is now attached to the task
  assert.deepEqual(after.meta.sessions, ['sess-1']);

  // running again must not duplicate it
  const again = dolly(sb.dir, ['hook', 'stop'], {
    DOLLY_DIR: sb.store,
    DOLLY_TRANSCRIPT_DIR: tRoot,
  });
  assert.doesNotMatch(again, /auto-logged/);
  assert.equal(Store.open().resolve('1').meta.steps, 1);
});

test('a turn the agent logged itself is left alone', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Self logged' });
  setStatus(store, task, 'working');

  const tRoot = path.join(sb.dir, 'transcripts');
  // the turn started in 2020 — long before the task was just touched
  plantTranscript(tRoot, sb.dir, 'sess-2', [
    turn('old-turn', '2020-01-01T10:00:00.000Z', 'do it', '2020-01-01T10:01:00.000Z', 'Did it.'),
  ]);

  const out = dolly(sb.dir, ['hook', 'stop'], {
    DOLLY_DIR: sb.store,
    DOLLY_TRANSCRIPT_DIR: tRoot,
  });
  assert.doesNotMatch(out, /auto-logged/);
  assert.equal(Store.open().resolve('1').meta.steps, 0);
});

test('auto-log respects the config switches', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Configured' });
  setStatus(store, task, 'validating'); // not `working`

  const tRoot = path.join(sb.dir, 'transcripts');
  plantTranscript(tRoot, sb.dir, 'sess-3', [
    turn('t3', '2030-01-01T10:00:00.000Z', 'x', '2030-01-01T10:01:00.000Z', 'Finished the audit and wrote up the findings.'),
  ]);
  const env = { DOLLY_DIR: sb.store, DOLLY_TRANSCRIPT_DIR: tRoot };

  // onlyWhenWorking is on by default, so `validating` is skipped
  assert.doesNotMatch(dolly(sb.dir, ['hook', 'stop'], env), /auto-logged/);
  assert.equal(Store.open().resolve('1').meta.steps, 0);

  dolly(sb.dir, ['config', 'set', 'reindex.autoLogOnlyWhenWorking', 'false'], env);
  assert.match(dolly(sb.dir, ['hook', 'stop'], env), /auto-logged 1 step/);

  // and autoLog=false disables it entirely
  dolly(sb.dir, ['config', 'set', 'reindex.autoLog', 'false'], env);
  plantTranscript(tRoot, sb.dir, 'sess-3', [
    turn('t3', '2030-01-01T10:00:00.000Z', 'x', '2030-01-01T10:01:00.000Z', 'Finished the audit and wrote up the findings.'),
    turn('t4', '2031-01-01T10:00:00.000Z', 'y', '2031-01-01T10:01:00.000Z', 'Also rewrote the migration to be idempotent.'),
  ]);
  assert.doesNotMatch(dolly(sb.dir, ['hook', 'stop'], env), /auto-logged/);
  assert.equal(Store.open().resolve('1').meta.steps, 1);
});

test('session-start injects an index that points at the full read', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Injected', specShort: 'do the thing well' });
  setStatus(store, task, 'working');

  const out = dolly(sb.dir, ['hook', 'session-start'], { DOLLY_DIR: sb.store });
  const payload = JSON.parse(out);
  assert.equal(payload.hookSpecificOutput.hookEventName, 'SessionStart');
  const ctx = payload.hookSpecificOutput.additionalContext;
  assert.match(ctx, /Active task 0001 "Injected" \(working\)/);
  assert.match(ctx, /do the thing well/);
  assert.match(ctx, /## Most recent events/);
  assert.match(ctx, /index, not the record/);
  assert.match(ctx, /dolly context 0001/);
  assert.match(ctx, /what you understood and did/);
});

test('session-start --raw emits plain context, no Claude JSON envelope', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Injected', specShort: 'do the thing well' });
  setStatus(store, task, 'working');

  const out = dolly(sb.dir, ['hook', 'session-start', '--raw'], { DOLLY_DIR: sb.store });
  // no envelope — harnesses that are not Claude consume the text directly
  assert.doesNotMatch(out, /hookSpecificOutput/);
  // the same context that would have been wrapped, as-is
  assert.match(out, /Active task 0001 "Injected" \(working\)/);
  assert.match(out, /do the thing well/);
  assert.match(out, /index, not the record/);
});
