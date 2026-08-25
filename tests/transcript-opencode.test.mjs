import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { listSessions, parseTranscript } from '../dist/core/transcript.js';

/**
 * The generated opencode plugin mirrors one finished turn per JSONL line under
 * DOLLY_OPENCODE_DIR/<escaped-cwd>/<session>.jsonl. reindex reads that mirror.
 */
const MIRROR = JSON.stringify({
  index: 1,
  uuid: 'msg-1',
  at: '2026-08-25T10:00:00.000Z',
  endedAt: '2026-08-25T10:01:00.000Z',
  prompt: 'fix the login bug',
  files: ['src/auth.ts'],
  commands: ['npm test'],
  tools: { edit: 2, bash: 1 },
  assistantTexts: ['Fixed the null check in the login path.'],
  workChain: ['Edit auth.ts ×2', 'Bash: npm test'],
});

function writeMirror(cwd, sessionId, lines) {
  const dir = path.join(
    process.env.DOLLY_OPENCODE_DIR,
    cwd.replace(/[^a-zA-Z0-9]/g, '-'),
  );
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), lines.join('\n') + '\n');
}

test('opencode mirror sessions are listed alongside claude ones', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-mirror-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cwd = path.join(root, 'proj');
  fs.mkdirSync(cwd);
  process.env.DOLLY_OPENCODE_DIR = path.join(root, 'mirror');
  delete process.env.DOLLY_TRANSCRIPT_DIR;
  writeMirror(cwd, 'ses-aaaa', [MIRROR]);

  const sessions = listSessions(cwd);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].kind, 'opencode');
  assert.equal(sessions[0].sessionId, 'ses-aaaa');
});

test('parseTranscript reads a mirrored opencode session', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-mirror-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cwd = path.join(root, 'proj');
  fs.mkdirSync(cwd);
  process.env.DOLLY_OPENCODE_DIR = path.join(root, 'mirror');
  // a partially flushed last line is normal while a session is live
  writeMirror(cwd, 'ses-bbbb', [
    MIRROR,
    JSON.stringify({
      index: 2,
      uuid: 'msg-2',
      at: '2026-08-25T10:05:00.000Z',
      endedAt: '2026-08-25T10:06:00.000Z',
      prompt: 'now add tests',
      files: ['tests/auth.test.mjs'],
      commands: [],
      tools: { write: 1 },
      assistantTexts: ['Added a regression test.'],
      workChain: ['Write tests/auth.test.mjs'],
    }),
    '{"index":3,"uuid":"msg-3","at":"2026-08-25T10:',
  ]);

  const ref = listSessions(cwd)[0];
  assert.equal(ref.sessionId, 'ses-bbbb');
  const parsed = parseTranscript(ref);

  assert.equal(parsed.kind ?? '', '');
  assert.equal(parsed.title, 'fix the login bug');
  assert.equal(parsed.segments.length, 2, 'garbage tail line is dropped');
  assert.equal(parsed.segments[0].prompt, 'fix the login bug');
  assert.deepEqual(parsed.segments[0].files, ['src/auth.ts']);
  assert.equal(parsed.segments[1].assistantTexts[0], 'Added a regression test.');
  assert.deepEqual(parsed.tools, { edit: 2, bash: 1, write: 1 });
  assert.equal(parsed.startedAt, '2026-08-25T10:00:00.000Z');
  assert.equal(parsed.segments.every((s) => s.index > 0), true);
});
