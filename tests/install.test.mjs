import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from '../dist/core/types.js';
import { Store } from '../dist/core/store.js';
import { sandbox } from './helpers.mjs';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');

function dolly(cwd, args, env = {}) {
  return execFileSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, DOLLY_USER: 'tester', NO_COLOR: '1', ...env },
  });
}

test('install scope defaults to local', () => {
  assert.equal(DEFAULT_CONFIG.install.scope, 'local');
  assert.equal(DEFAULT_CONFIG.install.mcp, true);
});

test('init writes agent instructions into the project by default', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  delete process.env.DOLLY_DIR; // let the CLI discover the store from cwd
  fs.mkdirSync(path.join(sb.dir, '.claude'), { recursive: true });

  const out = dolly(sb.dir, ['init', '--agents', 'claude'], { DOLLY_DIR: '' });
  assert.match(out, /agent instructions: local/);

  assert.ok(fs.existsSync(path.join(sb.dir, 'CLAUDE.md')));
  assert.ok(fs.existsSync(path.join(sb.dir, '.mcp.json')));
  assert.ok(fs.existsSync(path.join(sb.dir, '.claude', 'skills', 'dolly', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(sb.dir, '.claude', 'commands', 'dolly', 'board.md')));

  const mcp = JSON.parse(fs.readFileSync(path.join(sb.dir, '.mcp.json'), 'utf8'));
  assert.deepEqual(mcp.mcpServers.dolly, { command: 'dolly', args: ['mcp'] });

  const claudeMd = fs.readFileSync(path.join(sb.dir, 'CLAUDE.md'), 'utf8');
  assert.match(claudeMd, /<!-- dolly:instructions -->/);
  assert.match(claudeMd, /dolly context current/);
});

test('install.scope=global in config flips the default; --local overrides it', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  store.init();
  store.saveConfig({ ...store.config, install: { scope: 'global', mcp: false } });

  const reopened = Store.open();
  assert.equal(reopened.config.install.scope, 'global');
  assert.equal(reopened.config.install.mcp, false);

  // dry run so the test never touches the real home directory
  const out = dolly(sb.dir, ['install', 'claude', '--dry-run'], { DOLLY_DIR: sb.store });
  assert.match(out, /scope: global/);
  assert.doesNotMatch(out, /\.mcp\.json/, 'install.mcp=false must skip MCP wiring');

  const local = dolly(sb.dir, ['install', 'claude', '--local', '--dry-run'], {
    DOLLY_DIR: sb.store,
  });
  assert.match(local, /scope: local/);
});

test('config set/get walks dotted keys', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  dolly(sb.dir, ['config', 'set', 'install.scope', 'global'], { DOLLY_DIR: sb.store });
  const got = dolly(sb.dir, ['config', 'get', 'install'], { DOLLY_DIR: sb.store });
  assert.deepEqual(JSON.parse(got), { scope: 'global', mcp: true });

  dolly(sb.dir, ['config', 'set', 'housekeep.archiveDoneAfterDays', '30'], {
    DOLLY_DIR: sb.store,
  });
  const days = dolly(sb.dir, ['config', 'get', 'housekeep.archiveDoneAfterDays'], {
    DOLLY_DIR: sb.store,
  });
  assert.equal(JSON.parse(days), 30);
});

test('repeated prose flags are not split on commas', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  dolly(sb.dir, ['new', 'Comma task',
    '--criteria', 'filters, sorted by name, return only matches',
    '--criteria', 'p95 under 300ms',
    '--tag', 'a,b',
  ], { DOLLY_DIR: sb.store });

  const got = JSON.parse(dolly(sb.dir, ['show', '1', '--json'], { DOLLY_DIR: sb.store }));
  assert.deepEqual(got.criteria.split('\n'), [
    '- [ ] filters, sorted by name, return only matches',
    '- [ ] p95 under 300ms',
  ]);
  // tags and file paths still split on commas — that is the documented shorthand
  assert.deepEqual(got.tags, ['a', 'b']);
});
