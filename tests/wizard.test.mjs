import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { globalStoreFor, indexFile, locateStore, readProjectIndex } from '../dist/core/store.js';
import { runWizard } from '../dist/wizard.js';

const CLI = path.resolve(import.meta.dirname, '..', 'dist', 'cli.js');

/**
 * A Term that answers by looking at what was just drawn.
 *
 * Scripting a flat list of keystrokes would break every time a prompt is added
 * or skipped; matching the question text keeps a test pinned to the decision it
 * is about. Anything unmatched is answered with enter — which is what "press
 * enter through the whole screen" means.
 */
function replyTerm({ reply = [], lines = [], raw = true } = {}) {
  const out = [];
  const pending = [...reply];
  let queue = [];
  let seen = 0;
  const all = () => out.join('');
  return {
    raw,
    columns: 100,
    out,
    text: () => all(),
    write: (s) => out.push(s),
    key: async () => {
      if (!queue.length) {
        const tail = all().slice(seen);
        seen = all().length;
        const i = pending.findIndex(([re]) => re.test(stripAnsi(tail)));
        if (i !== -1) queue = [].concat(pending.splice(i, 1)[0][1]);
      }
      const name = queue.length ? queue.shift() : 'return';
      return name === 'c-c' ? { name: 'c', ctrl: true, seq: '\x03' } : { name, ctrl: false, seq: '' };
    },
    line: async () => (lines.length ? lines.shift() : ''),
    close: () => {},
    unanswered: () => pending.map(([re]) => String(re)),
  };
}

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

/**
 * An isolated world: its own ~/.dolly, its own HOME, its own project.
 *
 * HOME matters as much as DOLLY_HOME here. Agent detection and a global-scope
 * install both read the user's home directory, so a test that leaves the real
 * one in place both depends on whatever the developer happens to have installed
 * and writes agent instructions into their actual `~/.claude`.
 */
function ground(t, { git = true } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-home-'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-proj-'));
  const prev = { home: process.env.DOLLY_HOME, dir: process.env.DOLLY_DIR, real: process.env.HOME };
  process.env.DOLLY_HOME = home;
  process.env.HOME = home;
  process.env.DOLLY_USER = 'tester';
  delete process.env.DOLLY_DIR;
  if (git) {
    execFileSync('git', ['init', '-q'], { cwd: project });
    execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: project });
    execFileSync('git', ['config', 'user.name', 'tester'], { cwd: project });
  }
  t.after(() => {
    if (prev.home === undefined) delete process.env.DOLLY_HOME;
    else process.env.DOLLY_HOME = prev.home;
    if (prev.dir === undefined) delete process.env.DOLLY_DIR;
    else process.env.DOLLY_DIR = prev.dir;
    if (prev.real === undefined) delete process.env.HOME;
    else process.env.HOME = prev.real;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(project, { recursive: true, force: true });
  });
  return { home: fs.realpathSync(home), project: fs.realpathSync(project) };
}

const NO_AGENTS = [/agents should dolly wire/i, ['n', 'return']];
const NO_BRIEF = [/project brief/i, 'n'];
const NO_STAGE = [/Stage \.dolly/i, 'n'];
const GLOBAL_STORE = [/task memory live/i, ['down', 'return']];

function tree(root) {
  const out = {};
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p, r);
      else out[r] = fs.readFileSync(p, 'utf8');
    }
  };
  walk(root, '');
  return out;
}

function dolly(cwd, args, env = {}) {
  return execFileSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, DOLLY_USER: 'tester', NO_COLOR: '1', ...env },
  });
}

/* ------------------------- enter-through == today -------------------------- */

test('enter-through leaves the same store the old non-interactive init writes', async (t) => {
  const a = ground(t);
  const term = replyTerm({ reply: [NO_AGENTS, NO_BRIEF, NO_STAGE] });
  await runWizard({ term, cwd: a.project });
  assert.deepEqual(term.unanswered(), [], 'every scripted question was actually asked');

  const b = ground(t);
  dolly(b.project, ['init', '--yes', '--no-agents']);

  assert.deepEqual(tree(path.join(a.project, '.dolly')), tree(path.join(b.project, '.dolly')));
});

test('the defaults the wizard opens on are the shipped defaults', async (t) => {
  const g = ground(t);
  await runWizard({
    term: replyTerm({ reply: [NO_AGENTS, NO_BRIEF, NO_STAGE] }),
    cwd: g.project,
  });
  const cfg = JSON.parse(fs.readFileSync(path.join(g.project, '.dolly', 'config.json'), 'utf8'));
  assert.equal(cfg.install.scope, 'local');
  assert.equal(cfg.install.mcp, true);
  assert.equal(cfg.reindex.autoLog, true);
  assert.equal(fs.existsSync(path.join(g.project, '.dolly', 'local.json')), false, 'no pinned handle');
});

/* -------------------------------- re-run ---------------------------------- */

test('re-running and accepting everything changes not one byte', async (t) => {
  const g = ground(t);
  const first = { term: replyTerm({ reply: [NO_AGENTS, NO_BRIEF, NO_STAGE] }), cwd: g.project };
  await runWizard(first);
  const before = tree(path.join(g.project, '.dolly'));

  // the brief is offered again — it is still missing — and declined again
  const term = replyTerm({ reply: [NO_AGENTS, NO_BRIEF, NO_STAGE] });
  const res = await runWizard({ term, cwd: g.project });
  assert.deepEqual(tree(path.join(g.project, '.dolly')), before);
  assert.deepEqual(res.wrote.filter((w) => /wrote|created|moved/.test(w)), []);
  assert.match(term.text(), /reconfiguring the store/);
});

/* ----------------------------- global store ------------------------------- */

test('choosing the private store puts it under ~/.dolly and links the repo', async (t) => {
  const g = ground(t);
  const res = await runWizard({
    term: replyTerm({ reply: [GLOBAL_STORE, NO_AGENTS, NO_BRIEF] }),
    cwd: g.project,
  });

  const expected = globalStoreFor(g.project, g.home);
  assert.equal(res.storeChoice, 'global');
  assert.equal(res.storeRoot, expected);
  assert.ok(fs.existsSync(path.join(expected, 'tasks')));
  const entry = readProjectIndex(indexFile(g.home))[g.project];
  assert.equal(entry.store, expected);
  assert.equal(entry.local, false, 'recorded as living outside the repo');
  assert.match(entry.created, /^\d{4}-\d{2}-\d{2}T/);

  // the repo stays clean — that is the whole point of the choice
  assert.equal(fs.existsSync(path.join(g.project, '.dolly')), false);
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: g.project, encoding: 'utf8' });
  assert.equal(status.trim(), '');

  assert.equal(locateStore(g.project).root, expected);
  assert.match(dolly(g.project, ['board']), /task board|empty|dolly ·/i);
});

test('a nested directory of a linked repo finds the store too', async (t) => {
  const g = ground(t);
  await runWizard({
    term: replyTerm({ reply: [GLOBAL_STORE, NO_AGENTS, NO_BRIEF] }),
    cwd: g.project,
  });
  const nested = path.join(g.project, 'src', 'a');
  fs.mkdirSync(nested, { recursive: true });
  dolly(nested, ['new', 'from below', '--short', 's']);
  const tasks = fs.readdirSync(path.join(globalStoreFor(g.project, g.home), 'tasks'));
  assert.equal(tasks.length, 1);
});

test('an out-of-repo store announces itself to the user and to the agent', async (t) => {
  const g = ground(t);
  await runWizard({
    term: replyTerm({ reply: [GLOBAL_STORE, NO_AGENTS, NO_BRIEF] }),
    cwd: g.project,
  });

  // the user, in the one header they see on every board
  const board = dolly(g.project, ['board']);
  assert.match(board, /private to you — outside the repo, nothing to commit/);

  // the user, when they ask directly
  assert.match(dolly(g.project, ['whoami']), /\(linked\)/);

  // the agent, at session start — the instruction block claims .dolly/ is
  // committed, so the exception has to be stated where the agent reads
  const hook = JSON.parse(dolly(g.project, ['hook', 'session-start']));
  const ctx = hook.hookSpecificOutput.additionalContext;
  assert.match(ctx, /store is NOT in this repo/);
  assert.match(ctx, /Nothing to commit/);
  assert.match(ctx, new RegExp(globalStoreFor(g.project, g.home).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  // and the store itself, for whoever opens the directory
  const readme = fs.readFileSync(path.join(globalStoreFor(g.project, g.home), 'README.md'), 'utf8');
  assert.match(readme, /nothing to commit/);
  assert.doesNotMatch(readme, /Commit this directory/);
});

test('a repo-local store still tells everyone to commit it', async (t) => {
  const g = ground(t);
  await runWizard({
    term: replyTerm({ reply: [NO_AGENTS, NO_BRIEF, NO_STAGE] }),
    cwd: g.project,
  });
  assert.doesNotMatch(dolly(g.project, ['board']), /private to you|outside the repo/);
  const hook = JSON.parse(dolly(g.project, ['hook', 'session-start']));
  assert.doesNotMatch(hook.hookSpecificOutput.additionalContext, /NOT in this repo/);
  const readme = fs.readFileSync(path.join(g.project, '.dolly', 'README.md'), 'utf8');
  assert.match(readme, /Commit this directory/);
});

/* ------------------------------ moving back ------------------------------- */

test('switching back to the repo moves the tasks and drops the link', async (t) => {
  const g = ground(t);
  await runWizard({
    term: replyTerm({ reply: [GLOBAL_STORE, NO_AGENTS, NO_BRIEF] }),
    cwd: g.project,
  });
  dolly(g.project, ['new', 'survivor', '--short', 'must live']);
  const survivorId = JSON.parse(dolly(g.project, ['board', '--json'])).tasks[0].id;
  dolly(g.project, ['step', survivorId, '-m', 'a step that must survive the move']);

  const res = await runWizard({
    term: replyTerm({ reply: [[/task memory live/i, ['up', 'return']], NO_AGENTS, NO_STAGE] }),
    cwd: g.project,
  });

  assert.equal(res.storeChoice, 'local');
  assert.equal(res.storeRoot, path.join(g.project, '.dolly'));
  assert.ok(res.moved, 'the move happened');
  assert.equal(fs.existsSync(globalStoreFor(g.project, g.home)), false, 'no store left behind');
  const entry = readProjectIndex(indexFile(g.home))[g.project];
  assert.equal(entry.local, true, 'the project stays known, now recorded as in-repo');
  assert.equal(entry.store, path.join(g.project, '.dolly'));

  const dirs = fs.readdirSync(path.join(g.project, '.dolly', 'tasks'));
  assert.equal(dirs.length, 1);
  const task = fs.readFileSync(path.join(g.project, '.dolly', 'tasks', dirs[0], 'task.md'), 'utf8');
  assert.match(task, /survivor/);
  assert.match(task, /a step that must survive the move/);
  assert.equal(locateStore(g.project).kind, 'found');
});

test('moving a committed store out says the removal still has to be committed', async (t) => {
  const g = ground(t);
  await runWizard({
    term: replyTerm({ reply: [NO_AGENTS, NO_BRIEF, NO_STAGE] }),
    cwd: g.project,
  });
  execFileSync('git', ['add', '-A'], { cwd: g.project });
  execFileSync('git', ['commit', '-qm', 'add store'], { cwd: g.project });

  const term = replyTerm({ reply: [GLOBAL_STORE, NO_AGENTS, NO_BRIEF] });
  const res = await runWizard({ term, cwd: g.project });
  assert.ok(res.moved);
  const out = stripAnsi(term.text());
  assert.match(out, /still tracked by git/);
  assert.match(out, /git rm -r --cached \.dolly/);
  assert.doesNotMatch(out, /nothing is committed/, 'that would be false here');
});

test('moving a store that was never committed says nothing about git', async (t) => {
  const g = ground(t);
  await runWizard({
    term: replyTerm({ reply: [NO_AGENTS, NO_BRIEF, NO_STAGE] }),
    cwd: g.project,
  });
  const term = replyTerm({ reply: [GLOBAL_STORE, NO_AGENTS, NO_BRIEF] });
  await runWizard({ term, cwd: g.project });
  assert.doesNotMatch(stripAnsi(term.text()), /still tracked/);
});

test('declining the move leaves the store exactly where it was', async (t) => {
  const g = ground(t);
  await runWizard({
    term: replyTerm({ reply: [NO_AGENTS, NO_BRIEF, NO_STAGE] }),
    cwd: g.project,
  });
  const res = await runWizard({
    term: replyTerm({ reply: [GLOBAL_STORE, [/Move the existing store/i, 'n'], NO_AGENTS, NO_STAGE] }),
    cwd: g.project,
  });
  assert.equal(res.moved, null);
  assert.equal(res.storeRoot, path.join(g.project, '.dolly'));
  assert.equal(fs.existsSync(globalStoreFor(g.project, g.home)), false);
  assert.equal(readProjectIndex(indexFile(g.home))[g.project].local, true);
});

/* ---------------------------- non-default answers ------------------------- */

test('every non-default answer lands in the file that owns it', async (t) => {
  const g = ground(t);
  fs.mkdirSync(path.join(g.project, '.claude'), { recursive: true });
  const term = replyTerm({
    reply: [
      [/agents should dolly wire/i, ['n', 'space', 'return']], // clear, then check the first target
      [/agent instructions be written/i, ['down', 'return']], // user config
      [/MCP server/i, 'n'],
      [/hooks/i, 'n'],
      [/Auto-log/i, 'n'],
      NO_BRIEF,
      NO_STAGE,
    ],
    lines: ['someone-else'],
  });
  const res = await runWizard({ term, cwd: g.project });
  assert.deepEqual(term.unanswered(), []);
  assert.deepEqual(res.agents, ['claude']);

  const root = path.join(g.project, '.dolly');
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
  assert.equal(cfg.install.scope, 'global');
  assert.equal(cfg.install.mcp, false);
  assert.equal(cfg.reindex.autoLog, false);
  assert.equal(cfg.user, undefined, 'the handle never reaches the shared config');

  const local = JSON.parse(fs.readFileSync(path.join(root, 'local.json'), 'utf8'));
  assert.equal(local.user, 'someone-else');

  // instructions went to the user config, so they are in HOME and not the repo
  assert.equal(fs.existsSync(path.join(g.project, 'CLAUDE.md')), false);
  assert.ok(fs.existsSync(path.join(g.home, '.claude', 'CLAUDE.md')));
  assert.ok(fs.existsSync(path.join(g.home, '.claude', 'skills', 'dolly', 'SKILL.md')));
  assert.equal(fs.existsSync(path.join(g.home, '.claude.json')), false, 'mcp declined');
  assert.equal(fs.existsSync(path.join(g.project, '.mcp.json')), false, 'mcp declined');
  assert.equal(
    fs.existsSync(path.join(g.home, '.claude', 'settings.json')),
    false,
    'hooks declined, so settings.json was never touched',
  );
});

test('accepting the project brief offer creates it, declining does not', async (t) => {
  const a = ground(t);
  await runWizard({
    term: replyTerm({ reply: [NO_AGENTS, [/project brief/i, 'y'], NO_STAGE] }),
    cwd: a.project,
  });
  assert.ok(fs.existsSync(path.join(a.project, '.dolly', 'project.md')));

  const b = ground(t);
  await runWizard({
    term: replyTerm({ reply: [NO_AGENTS, NO_BRIEF, NO_STAGE] }),
    cwd: b.project,
  });
  assert.equal(fs.existsSync(path.join(b.project, '.dolly', 'project.md')), false);
});

test('staging is offered for a repo-local store and actually stages', async (t) => {
  const g = ground(t);
  await runWizard({
    term: replyTerm({ reply: [NO_AGENTS, NO_BRIEF, [/Stage \.dolly/i, 'y']] }),
    cwd: g.project,
  });
  const staged = execFileSync('git', ['diff', '--cached', '--name-only'], {
    cwd: g.project,
    encoding: 'utf8',
  });
  assert.match(staged, /\.dolly\/README\.md/);
});

test('nothing is staged when the store is not in the repo', async (t) => {
  const g = ground(t);
  const term = replyTerm({ reply: [GLOBAL_STORE, NO_AGENTS, NO_BRIEF] });
  await runWizard({ term, cwd: g.project });
  assert.doesNotMatch(stripAnsi(term.text()), /Stage/);
});

test('a DOLLY_DIR store is left alone and never linked behind the env var', async (t) => {
  const g = ground(t);
  const pinned = path.join(g.home, 'pinned', '.dolly');
  process.env.DOLLY_DIR = pinned;
  try {
    const term = replyTerm({ reply: [NO_AGENTS, NO_BRIEF, NO_STAGE] });
    const res = await runWizard({ term, cwd: g.project });
    assert.equal(res.storeRoot, pinned);
    assert.match(stripAnsi(term.text()), /pinned by DOLLY_DIR/);
    assert.doesNotMatch(stripAnsi(term.text()), /task memory live/, 'the question is not asked');
    assert.equal(fs.existsSync(indexFile(g.home)), false, 'nothing linked');
  } finally {
    delete process.env.DOLLY_DIR;
  }
  assert.equal(locateStore(g.project).root, path.join(g.project, '.dolly'), 'no link outlives the env var');
});

/* ------------------------------ flag prefill ------------------------------ */

test('flags pre-answer the screen instead of bypassing it', async (t) => {
  const g = ground(t);
  const term = replyTerm({ reply: [NO_BRIEF, NO_STAGE] }); // agents/scope/mcp/hooks: accept as shown
  const res = await runWizard({
    term,
    cwd: g.project,
    pre: { store: 'local', agents: ['cursor'], scope: 'local', mcp: false, hooks: false },
  });

  assert.deepEqual(res.agents, ['cursor'], 'the flag pre-checked cursor, and enter kept it');
  const cfg = JSON.parse(fs.readFileSync(path.join(res.storeRoot, 'config.json'), 'utf8'));
  assert.equal(cfg.install.mcp, false, '--no-mcp arrived as the prompt default');
  assert.ok(fs.existsSync(path.join(g.project, '.cursor', 'rules', 'dolly.mdc')));
  assert.equal(fs.existsSync(path.join(g.project, '.cursor', 'mcp.json')), false);
  assert.match(stripAnsi(term.text()), /Which agents should dolly wire up here\?/, 'still asked');
});

/* -------------------------- the numbered fallback ------------------------- */

test('the numbered path reaches the same result as the arrow-key path', async (t) => {
  const arrows = ground(t);
  await runWizard({
    term: replyTerm({ reply: [GLOBAL_STORE, NO_AGENTS, NO_BRIEF] }),
    cwd: arrows.project,
  });

  const typed = ground(t);
  // store: 2 (private) · agents: n then enter · scope/mcp/hooks skipped (no agents)
  // handle: enter · autolog: enter · brief: n
  const term = replyTerm({ raw: false, lines: ['2', 'n', '', '', '', 'n'] });
  const res = await runWizard({ term, cwd: typed.project });

  assert.equal(res.storeChoice, 'global');
  assert.equal(res.agents.length, 0);
  const cfg = (root) => JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
  assert.deepEqual(cfg(res.storeRoot), cfg(globalStoreFor(arrows.project, arrows.home)));
  assert.doesNotMatch(stripAnsi(term.text()), /↑↓/, 'no arrow-key hints in the typed path');
});

/* -------------------------------- cancelling ------------------------------ */

test('cancelling at the first prompt writes nothing at all', async (t) => {
  const g = ground(t);
  const term = replyTerm({ reply: [[/task memory live/i, 'c-c']] });
  await assert.rejects(() => runWizard({ term, cwd: g.project }), /cancel/i);
  assert.equal(fs.existsSync(path.join(g.project, '.dolly')), false);
  assert.equal(fs.existsSync(indexFile(g.home)), false);
});

/* --------------------------------- dry run -------------------------------- */

test('a dry run asks everything and writes nothing', async (t) => {
  const g = ground(t);
  const term = replyTerm({ reply: [GLOBAL_STORE, NO_AGENTS, NO_BRIEF] });
  const res = await runWizard({ term, cwd: g.project, dryRun: true });
  assert.equal(res.storeChoice, 'global');
  assert.equal(fs.existsSync(globalStoreFor(g.project, g.home)), false);
  assert.equal(fs.existsSync(indexFile(g.home)), false);
  assert.match(stripAnsi(term.text()), /dry run — nothing written/);
});

/* ------------------------------ the CLI gate ------------------------------ */

test('a bare init with no terminal refuses and says how to proceed', (t) => {
  const g = ground(t);
  let err;
  try {
    dolly(g.project, ['init']);
  } catch (e) {
    err = e;
  }
  assert.ok(err, 'exited non-zero');
  assert.match(err.stderr, /--yes/);
  assert.match(err.stderr, /--agents/);
  assert.equal(fs.existsSync(path.join(g.project, '.dolly')), false);
});

test('an init that already carries flags keeps working without a terminal', (t) => {
  const g = ground(t);
  const out = dolly(g.project, ['init', '--no-agents']);
  assert.match(out, /created/);
  assert.ok(fs.existsSync(path.join(g.project, '.dolly', 'config.json')));
});

test('--yes takes the defaults and prints no prompt', (t) => {
  const g = ground(t);
  const out = dolly(g.project, ['init', '--yes']);
  assert.doesNotMatch(out, /Where should|↑↓|\[Y\/n\]/);
  const cfg = JSON.parse(fs.readFileSync(path.join(g.project, '.dolly', 'config.json'), 'utf8'));
  assert.equal(cfg.install.scope, 'local');
});

test('--store is honoured on the non-interactive path, not silently dropped', (t) => {
  const g = ground(t);
  const out = dolly(g.project, ['init', '--yes', '--no-agents', '--store', 'global']);
  assert.match(out, /private to you/);
  assert.equal(fs.existsSync(path.join(g.project, '.dolly')), false, 'no repo-local store');
  assert.ok(fs.existsSync(path.join(globalStoreFor(g.project, g.home), 'tasks')));
  assert.equal(readProjectIndex(indexFile(g.home))[g.project].local, false);
  assert.equal(
    execFileSync('git', ['status', '--porcelain'], { cwd: g.project, encoding: 'utf8' }).trim(),
    '',
  );
});

test('a misspelled --store is an error, not a default', (t) => {
  const g = ground(t);
  assert.throws(() => dolly(g.project, ['init', '--yes', '--store', 'globl']), /local or global/);
  assert.equal(fs.existsSync(path.join(g.project, '.dolly')), false);
});

test('--store never relocates an existing store without a confirmation', (t) => {
  const g = ground(t);
  dolly(g.project, ['init', '--yes', '--no-agents']);
  let err;
  try {
    dolly(g.project, ['init', '--yes', '--no-agents', '--store', 'global']);
  } catch (e) {
    err = e;
  }
  assert.ok(err, 'refused');
  assert.match(err.stderr, /already has a store/);
  assert.match(err.stderr, /dolly setup/);
  assert.ok(fs.existsSync(path.join(g.project, '.dolly')), 'the store is untouched');
  assert.equal(fs.existsSync(globalStoreFor(g.project, g.home)), false, 'and nothing was created');
});

test('setup always needs a terminal', (t) => {
  const g = ground(t);
  dolly(g.project, ['init', '--yes', '--no-agents']);
  assert.throws(() => dolly(g.project, ['setup']), /not a terminal|--yes/);
});

test('an agent gets the same refusal as a pipe, and never a prompt', (t) => {
  const g = ground(t);
  assert.throws(
    () => dolly(g.project, ['init'], { CLAUDECODE: '1' }),
    /inside an agent|--yes/,
  );
});

test('the MCP server exposes no wizard tool', () => {
  const req = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {} } },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  ]
    .map((r) => JSON.stringify(r))
    .join('\n');
  const out = execFileSync(process.execPath, [CLI, 'mcp'], {
    input: `${req}\n`,
    encoding: 'utf8',
    env: { ...process.env, DOLLY_USER: 'tester' },
  });
  assert.doesNotMatch(out, /wizard|dolly_setup/i);
  assert.match(out, /dolly_board/);
});
