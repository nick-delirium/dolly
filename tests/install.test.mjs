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

  dolly(sb.dir, ['config', 'set', 'reindex.includeThinking', 'true'], {
    DOLLY_DIR: sb.store,
  });
  const thinking = dolly(sb.dir, ['config', 'get', 'reindex.includeThinking'], {
    DOLLY_DIR: sb.store,
  });
  assert.equal(JSON.parse(thinking), true);
});

test('repeated prose flags are not split on commas', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  const commaTask = JSON.parse(
    dolly(sb.dir, ['new', 'Comma task',
      '--criteria', 'filters, sorted by name, return only matches',
      '--criteria', 'p95 under 300ms',
      '--tag', 'a,b',
      '--json',
    ], { DOLLY_DIR: sb.store }),
  );

  const got = JSON.parse(dolly(sb.dir, ['show', commaTask.id, '--json'], { DOLLY_DIR: sb.store }));
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
  // auto-log: registers turn_end and feeds the in-memory turn to the stdin path
  assert.match(body, /turn_end/);
  assert.match(body, /hook.*stop.*--from-stdin/s);
  // returns the prompt augmented, never blocks: wrapped in try/catch
  assert.match(body, /try\s*\{/);
  assert.match(body, /systemPrompt/);
  // no hard dependency on a specific pi package name
  assert.doesNotMatch(body, /pi-coding-agent/);
});

test('install pi --global writes the slash commands as prompts, transformed', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  const fakeHome = path.join(sb.dir, 'home');
  fs.mkdirSync(path.join(fakeHome, '.pi', 'agent'), { recursive: true });

  dolly(sb.dir, ['install', 'pi', '--global'], { DOLLY_DIR: sb.store, HOME: fakeHome });

  const prompts = path.join(fakeHome, '.pi', 'agent', 'prompts');
  // flat files named dolly-<cmd>.md → invoked as /dolly-<cmd>
  assert.ok(fs.existsSync(path.join(prompts, 'dolly-board.md')), 'board prompt written');
  assert.ok(fs.existsSync(path.join(prompts, 'dolly-step.md')), 'step prompt written');
  const written = fs.readdirSync(prompts).filter((f) => f.startsWith('dolly-'));
  assert.equal(written.length, 9, 'all nine commands installed as prompts');

  const board = fs.readFileSync(path.join(prompts, 'dolly-board.md'), 'utf8');
  // frontmatter + $ARGUMENTS survive (pi understands both)
  assert.match(board, /description: Show the dolly task board/);
  assert.match(board, /\$ARGUMENTS/);
  // the Claude inline-exec syntax is gone, replaced by a fenced bash block
  assert.doesNotMatch(board, /!`/);
  assert.match(board, /```bash\ndolly board \$ARGUMENTS\n```/);

  // a command with two inline-exec lines transforms both
  const step = fs.readFileSync(path.join(prompts, 'dolly-step.md'), 'utf8');
  assert.doesNotMatch(step, /!`/);
  assert.match(step, /```bash\ndolly show \$\{ARGUMENTS:-current\} 2>&1 \| head -20\n```/);
  assert.match(step, /```bash\ngit status --porcelain 2>\/dev\/null \| head -30\n```/);

  // plan.md has no inline-exec — it must copy through untouched
  const plan = fs.readFileSync(path.join(prompts, 'dolly-plan.md'), 'utf8');
  assert.match(plan, /Follow the \*\*dolly-planning\*\* skill/);
});

test('install pi commands are local when scope is local', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  fs.mkdirSync(path.join(sb.dir, '.pi'), { recursive: true });

  dolly(sb.dir, ['install', 'pi', '--local'], { DOLLY_DIR: sb.store });

  // pi scans project prompts at .pi/prompts (sibling of .pi/skills)
  assert.ok(
    fs.existsSync(path.join(sb.dir, '.pi', 'prompts', 'dolly-board.md')),
    'board prompt written to project .pi/prompts',
  );
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

test('install opencode wires skills, commands, plugin, instructions and mcp', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  fs.mkdirSync(path.join(sb.dir, '.config'), { recursive: true });

  const out = dolly(sb.dir, ['install', 'opencode', '--local'], { DOLLY_DIR: sb.store });
  assert.match(out, /scope: local/);

  assert.ok(
    fs.existsSync(path.join(sb.dir, '.opencode', 'skills', 'dolly', 'SKILL.md')),
    'dolly skill copied into project .opencode/skills',
  );
  assert.ok(
    fs.existsSync(path.join(sb.dir, '.opencode', 'skills', 'dolly-planning', 'SKILL.md')),
    'dolly-planning skill copied into project .opencode/skills',
  );

  // flat command files named dolly-<cmd>.md → invoked as /dolly-<cmd>
  assert.ok(fs.existsSync(path.join(sb.dir, '.opencode', 'commands', 'dolly-board.md')));
  // opencode runs !`cmd` natively — the inline shell syntax must survive
  const board = fs.readFileSync(path.join(sb.dir, '.opencode', 'commands', 'dolly-board.md'), 'utf8');
  assert.match(board, /!`dolly board \$ARGUMENTS`/);

  // the ambient-behavior plugin
  const plugin = path.join(sb.dir, '.opencode', 'plugins', 'dolly.js');
  assert.ok(fs.existsSync(plugin), 'plugin written to .opencode/plugins/dolly.js');
  const body = fs.readFileSync(plugin, 'utf8');
  assert.match(body, /experimental\.chat\.system\.transform/, 'session-start injection hook');
  assert.match(body, /experimental\.session\.compacting/, 'compaction reinjection hook');
  assert.match(body, /session\.idle/, 'turn-end auto-log trigger');
  assert.match(body, /hook.*stop.*--from-stdin/s, 'auto-log feeds the stdin path');
  assert.match(body, /hook.*session-start.*--raw/s, 'context shells the raw variant');
  assert.match(body, /agent: "opencode"/, 'steps are stamped with the harness name');
  assert.doesNotMatch(body, /@opencode-ai/, 'no hard dependency on an opencode package');

  // display-only commands: intercepted, run via session.shell, LLM skipped
  assert.match(body, /command\.execute\.before/);
  assert.match(body, /session\.shell/);

  assert.ok(fs.existsSync(path.join(sb.dir, 'AGENTS.md')), 'instructions in AGENTS.md');
  assert.ok(fs.existsSync(path.join(sb.dir, 'opencode.json')), 'mcp registered');

  const cfg = JSON.parse(fs.readFileSync(path.join(sb.dir, 'opencode.json'), 'utf8'));
  assert.deepEqual(cfg.mcp.dolly, { type: 'local', command: ['dolly', 'mcp'], enabled: true });
});

test('install opencode is idempotent on rerun', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();

  dolly(sb.dir, ['install', 'opencode', '--local'], { DOLLY_DIR: sb.store });
  const second = dolly(sb.dir, ['install', 'opencode', '--local'], { DOLLY_DIR: sb.store });

  assert.match(second, /up-to-date .*plugins[/\\]dolly\.js/);
  assert.match(second, /up-to-date .*AGENTS\.md/);
});

test('install opencode --global resolves under ~/.config/opencode', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  const fakeHome = path.join(sb.dir, 'home');
  fs.mkdirSync(path.join(fakeHome, '.config', 'opencode'), { recursive: true });

  dolly(sb.dir, ['install', 'opencode', '--global'], { DOLLY_DIR: sb.store, HOME: fakeHome });

  assert.ok(fs.existsSync(path.join(fakeHome, '.config', 'opencode', 'skills', 'dolly', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(fakeHome, '.config', 'opencode', 'plugins', 'dolly.js')));
  assert.ok(fs.existsSync(path.join(fakeHome, '.config', 'opencode', 'AGENTS.md')));
  const cfg = JSON.parse(
    fs.readFileSync(path.join(fakeHome, '.config', 'opencode', 'opencode.json'), 'utf8'),
  );
  assert.equal(cfg.mcp.dolly.enabled, true, 'mcp registered in global config');
});
