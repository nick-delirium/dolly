// `dolly install` edits files the user owns. Regressions from the 2026-09-29
// review: configs wiped, links replaced, hooks and user sections deleted.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');

/** a throwaway project and HOME, so nothing touches the real user config */
function ground(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-inst-')));
  const home = path.join(root, 'home');
  const project = path.join(root, 'proj');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(project, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const run = (args) => {
    const r = spawnSync(process.execPath, [CLI, ...args], {
      cwd: project,
      encoding: 'utf8',
      env: { ...process.env, HOME: home, DOLLY_HOME: home, DOLLY_DIR: path.join(project, '.dolly'), DOLLY_USER: 'tester', NO_COLOR: '1' },
    });
    return { out: `${r.stdout}${r.stderr}`, code: r.status };
  };
  return { home, project, run, read: (p) => fs.readFileSync(path.join(project, p), 'utf8') };
}

test('a config that does not parse is skipped with a note, never wiped', (t) => {
  const g = ground(t);
  const jsonc = '{\n  // my model\n  "model": "x",\n}\n';
  fs.writeFileSync(path.join(g.project, 'opencode.json'), jsonc);
  fs.mkdirSync(path.join(g.project, '.claude'));
  const trailing = '{"permissions": {"allow": ["Bash(ls)"]},}\n';
  fs.writeFileSync(path.join(g.project, '.claude', 'settings.json'), trailing);

  const r = g.run(['install', 'opencode', 'claude', '--mcp']);
  assert.equal(r.code, 0, r.out);
  assert.equal(g.read('opencode.json'), jsonc);
  assert.equal(g.read('.claude/settings.json'), trailing);
  assert.match(r.out, /skipped .*opencode\.json — .*comments.*Add mcp\.dolly by hand/);
  assert.match(r.out, /skipped .*settings\.json/);
});

test('a user MCP entry keeps its own command and env', (t) => {
  const g = ground(t);
  const mine = { mcpServers: { dolly: { command: '/opt/bin/dolly', args: ['old'], env: { A: '1' } }, other: {} } };
  fs.writeFileSync(path.join(g.project, '.mcp.json'), JSON.stringify(mine));
  fs.mkdirSync(path.join(g.project, '.claude'));
  g.run(['install', 'claude', '--mcp']);
  const after = JSON.parse(g.read('.mcp.json'));
  assert.deepEqual(after.mcpServers.dolly, { command: '/opt/bin/dolly', args: ['mcp'], env: { A: '1' } });
  assert.ok(after.mcpServers.other);
  assert.match(g.run(['install', 'claude', '--mcp']).out, /up-to-date .*\.mcp\.json/);
});

test('install prunes commands the package stopped shipping, and only those', (t) => {
  const g = ground(t);
  const cmds = path.join(g.project, '.claude', 'commands', 'dolly');
  fs.mkdirSync(cmds, { recursive: true });
  fs.writeFileSync(path.join(cmds, 'housekeep.md'), 'dolly housekeep\n');
  const oc = path.join(g.project, '.opencode', 'commands');
  fs.mkdirSync(oc, { recursive: true });
  fs.writeFileSync(path.join(oc, 'dolly-housekeep.md'), 'x');
  fs.writeFileSync(path.join(oc, 'mine.md'), 'user command');
  g.run(['install', 'claude', 'opencode']);
  assert.equal(fs.existsSync(path.join(cmds, 'housekeep.md')), false);
  assert.ok(fs.existsSync(path.join(cmds, 'step.md')));
  assert.equal(fs.existsSync(path.join(oc, 'dolly-housekeep.md')), false);
  assert.ok(fs.existsSync(path.join(oc, 'mine.md')), 'the user’s own command stays');
  assert.match(g.run(['install', 'claude']).out, /up-to-date .*skills\/dolly\b/);
});

test('shipped commands use arguments every harness substitutes', () => {
  const dir = path.resolve(path.dirname(CLI), '..', 'commands');
  for (const f of fs.readdirSync(dir)) {
    assert.doesNotMatch(fs.readFileSync(path.join(dir, f), 'utf8'), /\$\{(ARGUMENTS|\d+):-/, f);
  }
});

test('an orphan start marker is refused, not "repaired" over user sections', (t) => {
  const g = ground(t);
  fs.mkdirSync(path.join(g.project, '.claude'));
  const broken = '# Repo\n\n<!-- dolly:instructions -->\nold block\n\n## Build\n\nnpm run build\n';
  fs.writeFileSync(path.join(g.project, 'CLAUDE.md'), broken);
  const r = g.run(['install', 'claude']);
  assert.equal(r.code, 0);
  assert.match(r.out, /skipped .*CLAUDE\.md — .*no matching/);
  assert.equal(g.read('CLAUDE.md'), broken);
  assert.ok(fs.existsSync(path.join(g.project, '.claude', 'skills', 'dolly', 'SKILL.md')), 'the rest installed');
});

test('install writes through a symlinked CLAUDE.md', (t) => {
  const g = ground(t);
  fs.mkdirSync(path.join(g.project, '.claude'));
  fs.writeFileSync(path.join(g.project, 'AGENTS.md'), '# Shared\n');
  fs.symlinkSync('AGENTS.md', path.join(g.project, 'CLAUDE.md'));
  g.run(['install', 'claude']);
  assert.ok(fs.lstatSync(path.join(g.project, 'CLAUDE.md')).isSymbolicLink());
  assert.match(g.read('AGENTS.md'), /dolly:instructions/);
});

test('legacy cleanup removes only the old binary’s hooks', (t) => {
  const g = ground(t);
  fs.mkdirSync(path.join(g.project, '.claude'));
  const settings = {
    hooks: {
      PostToolUse: [{ hooks: [{ type: 'command', command: 'cd /work/dollie && npm run lint' }] }],
      Stop: [{ hooks: [{ type: 'command', command: 'dollie hook stop' }, { type: 'command', command: 'say done' }] }],
    },
  };
  fs.writeFileSync(path.join(g.project, '.claude', 'settings.json'), JSON.stringify(settings));
  g.run(['install', 'claude']);
  const after = JSON.parse(g.read('.claude/settings.json'));
  assert.equal(after.hooks.PostToolUse[0].hooks[0].command, 'cd /work/dollie && npm run lint');
  const stop = after.hooks.Stop.flatMap((grp) => grp.hooks.map((h) => h.command));
  assert.ok(stop.includes('say done'), 'the neighbouring hook survives');
  assert.ok(!stop.includes('dollie hook stop'));
  assert.ok(stop.some((c) => /command -v dolly .*dolly hook stop \|\| true/.test(c)), stop.join(' | '));
});

test('bare hook commands are upgraded to the guarded form, once', (t) => {
  const g = ground(t);
  fs.mkdirSync(path.join(g.project, '.claude'));
  fs.writeFileSync(
    path.join(g.project, '.claude', 'settings.json'),
    JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'dolly hook session-start' }] }] } }),
  );
  g.run(['install', 'claude']);
  g.run(['install', 'claude']);
  const after = JSON.parse(g.read('.claude/settings.json'));
  const all = after.hooks.SessionStart.flatMap((grp) => grp.hooks.map((h) => h.command));
  assert.deepEqual(all, ['command -v dolly >/dev/null 2>&1 && dolly hook session-start || true']);
});

test('codex: an existing [mcp_servers.dolly] is not defined twice; a local install leaves ~/.codex alone', (t) => {
  const g = ground(t);
  fs.mkdirSync(path.join(g.home, '.codex'));
  const toml = '[mcp_servers.dolly]\ncommand = "/usr/local/bin/dolly"\nargs = ["mcp"]\n';
  fs.writeFileSync(path.join(g.home, '.codex', 'config.toml'), toml);
  g.run(['install', 'codex', '--global', '--mcp']);
  assert.equal(fs.readFileSync(path.join(g.home, '.codex', 'config.toml'), 'utf8'), toml);
  fs.rmSync(path.join(g.home, '.codex', 'config.toml'));
  const local = g.run(['install', 'codex', '--mcp']);
  assert.match(local.out, /skipped MCP — codex reads it from ~\/\.codex\/config\.toml only/);
  assert.equal(fs.existsSync(path.join(g.home, '.codex', 'config.toml')), false);
});

test('--global writes user-level files, or says a target is project-only', (t) => {
  const g = ground(t);
  const r = g.run(['install', 'gemini', 'copilot', 'pi', 'agents', '--global']);
  assert.ok(fs.existsSync(path.join(g.home, '.gemini', 'GEMINI.md')));
  assert.ok(fs.existsSync(path.join(g.home, '.pi', 'agent', 'AGENTS.md')), 'pi reads its global AGENTS.md');
  assert.equal(fs.existsSync(path.join(g.home, '.pi', 'agent', 'SYSTEM.md')), false, 'SYSTEM.md replaces pi’s prompt');
  assert.equal(fs.existsSync(path.join(g.project, 'GEMINI.md')), false);
  assert.equal(fs.existsSync(path.join(g.project, '.github')), false);
  assert.equal(fs.existsSync(path.join(g.project, 'AGENTS.md')), false);
  assert.match(r.out, /project-only/);
});

test('a .github/ directory alone does not mean Copilot', (t) => {
  const g = ground(t);
  fs.mkdirSync(path.join(g.project, '.github', 'workflows'), { recursive: true });
  g.run(['init', '--yes']);
  assert.equal(fs.existsSync(path.join(g.project, '.github', 'copilot-instructions.md')), false);
});
