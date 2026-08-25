import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { VERSION, repoSlug } from '../dist/core/pkg.js';
import {
  cacheStale,
  checkEnabled,
  cmpSemver,
  installKind,
  isNewer,
  suppressed,
  updateNotice,
  upgradeCommand,
} from '../dist/core/update.js';
import { dirtyClone, planUpdate } from '../dist/core/selfupdate.js';
import { sandbox } from './helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---------------------- one source of truth for version -------------------- */

test('the version is read from package.json, not hardcoded', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(VERSION, pkg.version);
  // it used to be duplicated in four files; these two are now derived
  for (const f of ['src/cli.ts', 'src/mcp.ts']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.doesNotMatch(src, /=\s*['"]\d+\.\d+\.\d+['"]/, `${f} must not hardcode a version`);
  }
});

test('plugin.json version matches package.json', () => {
  // static JSON read by Claude Code, so it cannot be derived at runtime — this
  // assertion is the only thing keeping it honest when a release is cut
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const plugin = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(plugin.version, pkg.version, 'bump .claude-plugin/plugin.json with package.json');
});

test('the repo slug is parsed for the GitHub lookup', () => {
  assert.equal(repoSlug(), 'nick-delirium/dolly');
});

/* --------------------------------- semver --------------------------------- */

test('semver comparison handles the cases a release actually hits', () => {
  assert.equal(cmpSemver('0.2.0', '0.1.0'), 1);
  assert.equal(cmpSemver('0.1.0', '0.2.0'), -1);
  assert.equal(cmpSemver('1.0.0', '0.9.9'), 1);
  assert.equal(cmpSemver('0.1.10', '0.1.9'), 1, 'numeric, not lexical');
  assert.equal(cmpSemver('v0.2.0', '0.2.0'), 0, 'a leading v is the tag form');
  assert.equal(cmpSemver('0.2.0-beta.1', '0.2.0'), 0, 'prereleases sort as their base');

  assert.equal(isNewer('0.2.0', '0.1.0'), true);
  assert.equal(isNewer('0.1.0', '0.1.0'), false);
  assert.equal(isNewer('0.1.0', '0.2.0'), false, 'a dev build ahead of the tag is not "behind"');
  assert.equal(isNewer(null, '0.1.0'), false, 'a failed lookup never nags');
});

/* ------------------------------ suppression -------------------------------- */

test('the notice is suppressed everywhere it could do harm', () => {
  const tty = { env: {}, isTty: true };
  assert.equal(suppressed('board', tty), null, 'a human at a terminal sees it');

  // stdout is a protocol for these
  assert.match(suppressed('mcp', tty), /machine-read/);
  assert.match(suppressed('hook', tty), /machine-read/);
  assert.match(suppressed('statusline', tty), /machine-read/);

  // agents act on what they read
  assert.match(suppressed('board', { env: { CLAUDECODE: '1' }, isTty: true }), /inside an agent/);
  assert.match(suppressed('board', { ...tty, isTty: false }), /not a terminal/);

  // opt-outs
  assert.match(suppressed('board', { ...tty, enabled: false }), /disabled by config/);
  assert.match(suppressed('board', { env: { CI: 'true' }, isTty: true }), /CI/);
  assert.match(suppressed('board', { env: { NO_UPDATE_NOTIFIER: '1' }, isTty: true }), /NO_UPDATE_NOTIFIER/);
  assert.match(suppressed('board', { env: { DOLLY_NO_UPDATE_CHECK: '1' }, isTty: true }), /DOLLY_NO_UPDATE_CHECK/);
});

test('updateCheck=false in local.json turns it off', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  fs.mkdirSync(sb.store, { recursive: true });
  assert.equal(checkEnabled(sb.store), true, 'on by default');
  fs.writeFileSync(path.join(sb.store, 'local.json'), '{"updateCheck":false}', 'utf8');
  assert.equal(checkEnabled(sb.store), false);
});

/* --------------------------------- cache ---------------------------------- */

test('a stale or missing cache is refreshed, a fresh one is trusted', () => {
  const now = Date.parse('2026-08-07T12:00:00Z');
  assert.equal(cacheStale(null, 24, now), true, 'no cache yet');
  assert.equal(cacheStale({ checkedAt: 'nonsense', latest: null, source: 'none' }, 24, now), true);
  assert.equal(
    cacheStale({ checkedAt: '2026-08-07T11:00:00Z', latest: '0.1.0', source: 'git' }, 24, now),
    false,
    'an hour old is fresh',
  );
  assert.equal(
    cacheStale({ checkedAt: '2026-08-05T11:00:00Z', latest: '0.1.0', source: 'git' }, 24, now),
    true,
    'two days old is stale',
  );
});

/* ------------------------------ the notice --------------------------------- */

test('the notice appears only when the cache says a newer version exists', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const file = path.join(sb.dir, 'update.json');
  const opts = { file, storeRoot: sb.store, ttlHours: 24, env: {}, isTty: true };
  const fresh = (latest) =>
    fs.writeFileSync(file, JSON.stringify({ checkedAt: new Date().toISOString(), latest, source: 'git' }), 'utf8');

  fresh('9.9.9');
  const notice = updateNotice('board', '0.1.0', opts);
  assert.ok(notice, 'behind → notice');
  assert.match(notice, /dolly 9\.9\.9 is available \(you have 0\.1\.0\)/);
  assert.match(notice, /dolly config set updateCheck false/, 'always says how to stop');

  fresh('0.1.0');
  assert.equal(updateNotice('board', '0.1.0', opts), null, 'up to date → silence');

  fresh(null);
  assert.equal(updateNotice('board', '0.1.0', opts), null, 'failed lookup → silence');

  fresh('9.9.9');
  assert.equal(updateNotice('mcp', '0.1.0', opts), null, 'never on a protocol stream');
});

test('the upgrade command matches how this copy was installed', () => {
  assert.equal(installKind(ROOT), 'clone', 'this checkout is a git clone');
  assert.match(upgradeCommand('clone', ROOT), /^git -C .* pull && npm install$/);
  assert.match(upgradeCommand('package'), /^npm install -g github:nick-delirium\/dolly$/);
});

test('update plan matches the install kind, and dirty clones are caught', (t) => {
  const clone = planUpdate('clone', '/tmp/somewhere');
  assert.deepEqual(clone.steps, [
    ['git', '-C', '/tmp/somewhere', 'pull', '--ff-only'],
    ['npm', '--prefix', '/tmp/somewhere', 'install'],
  ]);
  assert.match(clone.reason, /checkout/);

  const pkg = planUpdate('package');
  assert.deepEqual(pkg.steps, [['npm', 'install', '-g', 'github:nick-delirium/dolly']]);

  // a real repo has git; an empty dir does not
  assert.equal(dirtyClone('/tmp/definitely-not-a-repo'), null);
});

test('the passive notice points at `dolly update`', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const cache = path.join(sb.dir, 'update.json');
  fs.writeFileSync(
    cache,
    JSON.stringify({ checkedAt: new Date().toISOString(), latest: '9.9.9', source: 'git' }),
  );
  const notice = updateNotice('board', '0.1.0', { file: cache, isTty: true, env: {} });
  assert.match(notice, /run: dolly update/);
});
