import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { tildeEncode, tildeExpand } from '../dist/core/store.js';

const HOME = os.homedir();

test('tildeEncode collapses a path under home to ~', () => {
  assert.equal(tildeEncode(path.join(HOME, 'code', 'acme')), '~/code/acme');
  assert.equal(tildeEncode(HOME), '~');
});

test('tildeEncode leaves a path outside home absolute', () => {
  const outside = path.resolve(path.sep, 'tmp', 'custom', 'store');
  assert.equal(tildeEncode(outside), outside);
});

test('tildeEncode does not collapse a mere prefix sibling of home', () => {
  // /home/bobby must not match home /home/bob
  const sibling = HOME + 'by' + path.sep + 'x';
  assert.equal(tildeEncode(sibling), sibling, 'only a real path boundary counts');
});

test('tildeExpand is the inverse of tildeEncode', () => {
  for (const abs of [path.join(HOME, 'a', 'b'), HOME, path.resolve(path.sep, 'tmp', 'x')]) {
    assert.equal(tildeExpand(tildeEncode(abs)), abs, `round-trip ${abs}`);
  }
});

test('tildeExpand passes an already-absolute path through unchanged', () => {
  const abs = path.resolve(path.sep, 'var', 'data');
  assert.equal(tildeExpand(abs), abs);
});

test('tildeEncode canonicalises a symlinked home (macOS /var, /tmp)', (t) => {
  // mkdtemp under os.tmpdir() returns the SYMLINK form on macOS (/var/...),
  // while real paths resolve to /private/var/... — home must be realpath'd
  // for the prefix to match, or a synced index never tilde-encodes.
  const rawHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-symhome-'));
  const realHome = fs.realpathSync(rawHome);
  const prev = process.env.HOME;
  process.env.HOME = rawHome; // unresolved, as a login shell would set it
  t.after(() => {
    if (prev === undefined) delete process.env.HOME;
    else process.env.HOME = prev;
    fs.rmSync(realHome, { recursive: true, force: true });
  });

  const underReal = path.join(realHome, 'code', 'acme');
  assert.equal(tildeEncode(underReal), '~/code/acme', 'resolved path still encodes to ~');
  assert.equal(tildeExpand('~/code/acme'), path.join(realHome, 'code', 'acme'));
});
