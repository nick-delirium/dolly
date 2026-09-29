// The MCP stdio server, driven over a real pipe.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { Store } from '../dist/core/store.js';
import { createTask } from '../dist/core/task.js';
import { sandbox } from './helpers.mjs';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');

/** send raw lines, get every response line parsed */
function rpc(cwd, lines) {
  const r = spawnSync(process.execPath, [CLI, 'mcp'], {
    cwd,
    input: `${lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n')}\n`,
    encoding: 'utf8',
    env: { ...process.env, DOLLY_USER: 'tester', NO_COLOR: '1' },
  });
  return {
    code: r.status,
    replies: (r.stdout ?? '').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)),
  };
}

const call = (id, name, args) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

test('garbage and non-objects get errors, never a crash', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const r = rpc(sb.dir, ['null', '42', '[1]', '{not json', { jsonrpc: '2.0', id: 1, method: 'ping' }]);
  assert.equal(r.code, 0);
  assert.deepEqual(r.replies.map((x) => x.error?.code ?? 'ok'), [-32600, -32600, -32600, -32700, 'ok']);
});

test('notifications are never answered', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const r = rpc(sb.dir, [
    { jsonrpc: '2.0', method: 'ping' },
    { jsonrpc: '2.0', method: 'tools/call', params: { name: 'dolly_board' } },
    { jsonrpc: '2.0', method: 'no/such' },
    { jsonrpc: '2.0', id: 7, method: 'ping' },
  ]);
  assert.deepEqual(r.replies.map((x) => x.id), [7]);
});

test('initialize negotiates a version it speaks', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const r = rpc(sb.dir, [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } },
    { jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } },
  ]);
  assert.equal(r.replies[0].result.protocolVersion, '2024-11-05');
  assert.equal(r.replies[1].result.protocolVersion, '2025-06-18');
});

test('arguments are checked against the tool schema', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  createTask(Store.open(), { title: 'Schema' });
  const r = rpc(sb.dir, [
    call(1, 'dolly_step_add', { ref: 'schema' }),
    call(2, 'dolly_step_add', { ref: 'schema', summary: 'x', files: [1, 2] }),
    call(3, 'dolly_spec_update', { ref: 'schema' }),
  ]);
  assert.match(r.replies[0].result.content[0].text, /missing required argument "summary"/);
  assert.match(r.replies[1].result.content[0].text, /"files" must be an array of strings/);
  assert.match(r.replies[2].result.content[0].text, /nothing to change/);
  assert.ok(r.replies.every((x) => x.result.isError));
});

test('reads work on a newer store; writes are refused', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  createTask(store, { title: 'Newer' });
  const cfg = JSON.parse(fs.readFileSync(store.configPath, 'utf8'));
  fs.writeFileSync(store.configPath, JSON.stringify({ ...cfg, version: 99 }));
  const r = rpc(sb.dir, [
    call(1, 'dolly_project', {}),
    call(2, 'dolly_project', { section: 'Overview', text: 'x' }),
    call(3, 'dolly_context', { ref: 'newer', brief: true }),
  ]);
  assert.equal(r.replies[0].result.isError, undefined);
  assert.match(r.replies[1].result.content[0].text, /upgrade dolly/);
  assert.match(r.replies[2].result.content[0].text, /Brief view/);
});

test('a leftover .dollie/ is a note, not a block on every write', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  createTask(Store.open(), { title: 'Orphan' });
  fs.mkdirSync(path.join(sb.dir, '.dollie'));
  const r = rpc(sb.dir, [call(1, 'dolly_step_add', { ref: 'orphan', summary: 'still writes' })]);
  const text = r.replies[0].result.content[0].text;
  assert.match(text, /step 0001 logged/);
  assert.match(text, /\.dollie still exists/);
});
