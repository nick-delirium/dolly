import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { commonDir } from '../dist/core/git.js';

function tmp(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

function initRepo(dir) {
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 't@e.c'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'f'), 'x\n');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir });
}

test('commonDir returns an absolute path inside a repo', (t) => {
  const repo = tmp('dolly-git-');
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  initRepo(repo);

  const cd = commonDir(repo);
  assert.ok(cd, 'resolves in a repo');
  assert.ok(path.isAbsolute(cd), `absolute, got ${cd}`);
  assert.equal(fs.existsSync(cd), true, 'points at a real .git dir');
});

test('commonDir is identical across a linked worktree', (t) => {
  const repo = tmp('dolly-git-');
  const wt = path.join(tmp('dolly-wt-'), 'linked');
  t.after(() => {
    execFileSync('git', ['worktree', 'remove', '--force', wt], { cwd: repo });
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(path.dirname(wt), { recursive: true, force: true });
  });
  initRepo(repo);
  execFileSync('git', ['worktree', 'add', '-q', wt, 'HEAD'], { cwd: repo });

  const fromMain = commonDir(repo);
  const fromWorktree = commonDir(wt);
  assert.ok(fromMain && fromWorktree);
  // show-toplevel differs per worktree; the common dir must not.
  assert.notEqual(
    execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: repo, encoding: 'utf8' }).trim(),
    execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: wt, encoding: 'utf8' }).trim(),
  );
  assert.equal(fromWorktree, fromMain, 'both worktrees share one common dir');
});

test('commonDir resolves symlinks, matching realpathSync', (t) => {
  const real = tmp('dolly-git-');
  const link = path.join(tmp('dolly-lnk-'), 'link');
  t.after(() => {
    fs.rmSync(real, { recursive: true, force: true });
    fs.rmSync(path.dirname(link), { recursive: true, force: true });
  });
  initRepo(real);
  fs.symlinkSync(real, link);
  // reached through a symlink, the common dir must still be the canonical one,
  // so it matches the realpath'd keys repoIdentity/projectKey compute.
  assert.equal(commonDir(link), path.join(fs.realpathSync(link), '.git'));
});

test('commonDir is null outside a git repo', (t) => {
  const plain = tmp('dolly-plain-');
  t.after(() => fs.rmSync(plain, { recursive: true, force: true }));
  assert.equal(commonDir(plain), null);
});
