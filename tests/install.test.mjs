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

test('pi is a registered install target', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  const out = dolly(sb.dir, ['install', '--list'], { DOLLY_DIR: sb.store });
  assert.match(out, /\bpi\b/, 'pi must appear in `dolly install --list`');
});

test('install pi wires skills, instructions, and mcp (local)', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  fs.mkdirSync(path.join(sb.dir, '.pi', 'agent'), { recursive: true });

  const out = dolly(sb.dir, ['install', 'pi', '--local'], { DOLLY_DIR: sb.store });
  assert.match(out, /scope: local/);

  // pi scans PROJECT skills at .pi/skills (NOT .pi/agent/skills)
  assert.ok(
    fs.existsSync(path.join(sb.dir, '.pi', 'skills', 'dolly', 'SKILL.md')),
    'dolly skill copied into project .pi/skills',
  );
  assert.ok(
    fs.existsSync(path.join(sb.dir, '.pi', 'skills', 'dolly-planning', 'SKILL.md')),
    'dolly-planning skill copied into project .pi/skills',
  );
  assert.ok(
    !fs.existsSync(path.join(sb.dir, '.pi', 'agent', 'skills')),
    '.pi/agent/skills is a global-only path, never written for a local install',
  );
  assert.ok(fs.existsSync(path.join(sb.dir, 'AGENTS.md')), 'local instructions in AGENTS.md');
  assert.ok(fs.existsSync(path.join(sb.dir, '.mcp.json')), 'local mcp in .mcp.json');

  const mcp = JSON.parse(fs.readFileSync(path.join(sb.dir, '.mcp.json'), 'utf8'));
  assert.deepEqual(mcp.mcpServers.dolly, { command: 'dolly', args: ['mcp'] });

  const agents = fs.readFileSync(path.join(sb.dir, 'AGENTS.md'), 'utf8');
  assert.match(agents, /<!-- dolly:instructions -->/);
  assert.match(agents, /dolly context current/);
});

test('install pi --global resolves skills under ~/.pi/agent/skills', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  // dry-run so the real home directory is never touched
  const out = dolly(sb.dir, ['install', 'pi', '--global', '--dry-run'], { DOLLY_DIR: sb.store });
  assert.match(out, /scope: global/);
  assert.match(out, /[/\\]\.pi[/\\]agent[/\\]skills[/\\]dolly\b/);
});

test('install pi --global writes the auto-inject extension', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  const fakeHome = path.join(sb.dir, 'home');
  fs.mkdirSync(path.join(fakeHome, '.pi', 'agent'), { recursive: true });

  dolly(sb.dir, ['install', 'pi', '--global'], { DOLLY_DIR: sb.store, HOME: fakeHome });

  const ext = path.join(fakeHome, '.pi', 'agent', 'extensions', 'dolly.ts');
  assert.ok(fs.existsSync(ext), 'extension written to ~/.pi/agent/extensions/dolly.ts');

  const body = fs.readFileSync(ext, 'utf8');
  // registers the injection hook and shells the existing dolly command
  assert.match(body, /before_agent_start/);
  // shells the raw variant so pi gets plain text, not Claude's JSON envelope
  assert.match(body, /hook.*session-start.*--raw/s);
  assert.doesNotMatch(body, /hookSpecificOutput/);
  // returns the prompt augmented, never blocks: wrapped in try/catch
  assert.match(body, /try\s*\{/);
  assert.match(body, /systemPrompt/);
  // no hard dependency on a specific pi package name
  assert.doesNotMatch(body, /pi-coding-agent/);
});

test('install pi extension is idempotent on rerun', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  const fakeHome = path.join(sb.dir, 'home');
  fs.mkdirSync(path.join(fakeHome, '.pi', 'agent'), { recursive: true });

  dolly(sb.dir, ['install', 'pi', '--global'], { DOLLY_DIR: sb.store, HOME: fakeHome });
  const second = dolly(sb.dir, ['install', 'pi', '--global'], { DOLLY_DIR: sb.store, HOME: fakeHome });
  assert.match(second, /up-to-date .*extensions[/\\]dolly\.ts/);
});

test('install pi is idempotent on rerun', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  fs.mkdirSync(path.join(sb.dir, '.pi', 'agent'), { recursive: true });

  dolly(sb.dir, ['install', 'pi', '--local'], { DOLLY_DIR: sb.store });
  const second = dolly(sb.dir, ['install', 'pi', '--local'], { DOLLY_DIR: sb.store });

  // instructions + mcp report no change the second time round
  assert.match(second, /up-to-date .*AGENTS\.md/);
  assert.match(second, /up-to-date .*\.mcp\.json/);
});
