// The opencode plugin, driven the way each opencode generation loads it:
// v2 calls the default export's setup(ctx); v1 calls server() (or, on older
// builds, the named export). Fake hosts stand in for opencode; `dolly` on PATH
// is this build.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { Store } from '../dist/core/store.js';
import { createTask, linkSession, logSection, reload, saveTask, setStatus } from '../dist/core/task.js';
import { sandbox } from './helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plugin = await import(pathToFileURL(path.join(ROOT, 'plugins', 'opencode.js')).href);

/** a sandboxed store, a working task attached to `session`, and `dolly` on PATH */
function rig(t, session) {
  const sb = sandbox();
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-bin-'));
  fs.writeFileSync(path.join(bin, 'dolly'), `#!/bin/sh\nexec "${process.execPath}" "${path.join(ROOT, 'dist', 'cli.js')}" "$@"\n`, { mode: 0o755 });
  const prev = { PATH: process.env.PATH, OC: process.env.DOLLY_OPENCODE_DIR, NU: process.env.DOLLY_NO_UPDATE_CHECK };
  process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;
  process.env.DOLLY_OPENCODE_DIR = path.join(sb.dir, 'mirror');
  process.env.DOLLY_NO_UPDATE_CHECK = '1';
  t.after(() => {
    process.env.PATH = prev.PATH;
    if (prev.OC === undefined) delete process.env.DOLLY_OPENCODE_DIR;
    else process.env.DOLLY_OPENCODE_DIR = prev.OC;
    if (prev.NU === undefined) delete process.env.DOLLY_NO_UPDATE_CHECK;
    fs.rmSync(bin, { recursive: true, force: true });
    sb.cleanup();
  });
  const store = Store.open();
  const task = createTask(store, { title: 'Work in opencode' });
  setStatus(store, reload(store, task), 'working');
  const fresh = reload(store, task);
  linkSession(fresh, session);
  saveTask(fresh);
  return { sb, task };
}

const mirrorLines = (sb) => {
  const dir = path.join(sb.dir, 'mirror');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap((d) =>
    fs.readdirSync(path.join(dir, d)).flatMap((f) => fs.readFileSync(path.join(dir, d, f), 'utf8').trim().split('\n')),
  );
};

test('v2: setup registers prompt/context/idle hooks; context injects, idle auto-logs and mirrors', async (t) => {
  const { sb, task } = rig(t, 'ses-v2');
  const hooks = {};
  const now = Date.now();
  const messages = [
    { id: 'u1', type: 'user', text: 'fix the parser', time: { created: now } },
    {
      id: 'a1',
      type: 'assistant',
      content: [
        { type: 'tool', id: 'c1', name: 'read', state: { status: 'completed', input: { filePath: path.join(sb.dir, 'src/a.ts') } } },
        { type: 'tool', id: 'c2', name: 'edit', state: { status: 'completed', input: { filePath: path.join(sb.dir, 'src/a.ts') } } },
        { type: 'tool', id: 'c3', name: 'bash', state: { status: 'completed', input: { command: 'npm test' } } },
        { type: 'text', text: 'V2-SUMMARY: parser fixed, tests pass.' },
      ],
    },
  ];
  const ctx = {
    location: { directory: sb.dir },
    session: {
      hook: async (name, cb) => {
        hooks[name] = cb;
        return { dispose() {} };
      },
      context: async ({ sessionID }) => (sessionID === 'ses-v2' ? messages : []),
    },
    event: { subscribe: () => ({ [Symbol.asyncIterator]: async function* () {} }) },
  };
  assert.equal(plugin.default.id, 'dolly');
  await plugin.default.setup(ctx);
  assert.deepEqual(Object.keys(hooks).sort(), ['compaction', 'context', 'experimental.idle', 'prompt']);

  await hooks.prompt({ sessionID: 'ses-v2', prompt: { text: 'fix the parser' } });
  const request = { sessionID: 'ses-v2', system: [], messages: [], options: {}, tools: {} };
  await hooks.context(request);
  assert.equal(request.system.length, 1);
  assert.equal(request.system[0].type, 'text');
  assert.match(request.system[0].text, /This conversation’s task: \S+ "Work in opencode"/, 'the session id reaches dolly');

  // held steady across requests and turns: the system prompt prefix stays cacheable
  const first = request.system[0].text;
  setStatus(Store.open(), reload(Store.open(), task), 'validating');
  await hooks.prompt({ sessionID: 'ses-v2', prompt: { text: 'next' } });
  const again = { sessionID: 'ses-v2', system: [] };
  await hooks.context(again);
  assert.equal(again.system[0].text, first, 'not re-read mid-session');
  await hooks.compaction({ sessionID: 'ses-v2' });
  const after = { sessionID: 'ses-v2', system: [] };
  await hooks.context(after);
  assert.match(after.system[0].text, /validating/, 're-read after a compaction');
  setStatus(Store.open(), reload(Store.open(), task), 'working');

  await hooks['experimental.idle']({ sessionID: 'ses-v2', background: [] });
  const log = logSection(reload(Store.open(), task));
  assert.match(log, /V2-SUMMARY: parser fixed/);
  assert.match(log, /src\/a\.ts/, 'the edited file is recorded; the read alone would not count');
  const [line] = mirrorLines(sb).map((l) => JSON.parse(l));
  assert.equal(line.prompt, 'fix the parser');
  assert.deepEqual(line.files, ['src/a.ts']);
  assert.deepEqual(line.commands, ['npm test']);

  // idle refires (background work finishing): nothing new, nothing logged twice
  await hooks['experimental.idle']({ sessionID: 'ses-v2', background: [] });
  assert.equal(reload(Store.open(), task).meta.steps, 1);
});

test('v2: a build without the idle hook falls back to the session.idle event stream', async (t) => {
  const { sb, task } = rig(t, 'ses-ev');
  const hooks = {};
  let release;
  const gate = new Promise((r) => (release = r));
  const ctx = {
    location: { directory: sb.dir },
    session: {
      hook: async (name, cb) => {
        if (name === 'experimental.idle') throw new Error('unknown hook');
        hooks[name] = cb;
      },
      context: async () => [
        { id: 'u9', type: 'user', text: 'write docs', time: { created: Date.now() } },
        { id: 'a9', type: 'assistant', content: [{ type: 'tool', name: 'write', state: { input: { filePath: 'DOCS.md' } } }, { type: 'text', text: 'EVENT-PATH done.' }] },
      ],
    },
    event: {
      subscribe: () => ({
        [Symbol.asyncIterator]: async function* () {
          yield { type: 'session.status', data: { sessionID: 'ses-ev' } };
          yield { type: 'session.idle', data: { sessionID: 'ses-ev' } };
          release();
        },
      }),
    },
  };
  const cleanup = await plugin.default.setup(ctx);
  assert.equal(typeof cleanup, 'function', 'the stream is closed on unload');
  await gate;
  await new Promise((r) => setTimeout(r, 50));
  assert.match(logSection(reload(Store.open(), task)), /EVENT-PATH done/);
  cleanup();
});

test('v1: server() returns hooks once per directory; idle reads client.session.messages', async (t) => {
  const { sb, task } = rig(t, 'ses-v1');
  const client = {
    session: {
      messages: async ({ path: p }) => ({
        data:
          p.id === 'ses-v1'
            ? [
                { info: { id: 'm1', role: 'user', time: { created: Date.now() } }, parts: [{ type: 'text', text: 'add a flag' }] },
                {
                  info: { id: 'm2', role: 'assistant' },
                  parts: [
                    { type: 'tool', tool: 'edit', state: { input: { filePath: 'src/flags.ts' } } },
                    { type: 'text', text: 'V1-SUMMARY: flag added.' },
                  ],
                },
              ]
            : [],
      }),
    },
  };
  const hooks = await plugin.default.server({ client, directory: sb.dir });
  for (const h of ['chat.message', 'experimental.chat.system.transform', 'experimental.session.compacting', 'command.execute.before', 'event']) {
    assert.equal(typeof hooks[h], 'function', h);
  }
  assert.deepEqual(await plugin.DollyPlugin({ client, directory: sb.dir }), {}, 'the legacy export does not register a second set');

  const out = { system: [] };
  await hooks['experimental.chat.system.transform']({}, out);
  assert.equal(typeof out.system[0], 'string');
  assert.match(out.system[0], /Work in opencode/);

  await hooks['chat.message']({ sessionID: 'ses-v1' });
  await hooks.event({ event: { type: 'session.idle', properties: { sessionID: 'ses-v1' } } });
  const log = logSection(reload(Store.open(), task));
  assert.match(log, /V1-SUMMARY: flag added/);
  assert.match(log, /src\/flags\.ts/);
});

test('a missing dolly binary never breaks either API', async (t) => {
  const prev = process.env.PATH;
  process.env.PATH = '/nonexistent';
  t.after(() => (process.env.PATH = prev));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-nobin-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const hooks = await plugin.DollyPlugin({ client: { session: { messages: async () => ({ data: [] }) } }, directory: dir });
  const out = { system: [] };
  await hooks['experimental.chat.system.transform']({}, out);
  assert.deepEqual(out.system, []);
  await hooks.event({ event: { type: 'session.idle', properties: { sessionID: 'x' } } });
  const v2 = {};
  await plugin.default.setup({
    location: { directory: dir },
    session: { hook: async (n, cb) => (v2[n] = cb), context: async () => [] },
    event: { subscribe: () => ({ [Symbol.asyncIterator]: async function* () {} }) },
  });
  const req = { system: [] };
  await v2.context(req);
  assert.deepEqual(req.system, []);
});
