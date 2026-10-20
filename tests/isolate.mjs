// Preloaded by `npm test` (node --import) before the runner and every test
// file. Without it a test that forgets to isolate itself reads and writes the
// developer's real home: install and migrate tests left global stores and
// index entries in ~/.dolly run after run, and the transcript tests matched
// whatever happened to sit in ~/.claude/projects.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

if (!process.env.DOLLY_TEST_HOME) {
  // canonical, like a real home: os.tmpdir() is a symlink on macOS, and dolly
  // compares the home it is given against realpath'd store paths
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-home-')));
  // the runner sets these once; the test processes it spawns inherit them
  process.env.DOLLY_TEST_HOME = home;
  process.env.DOLLY_HOME = home;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.on('exit', () => fs.rmSync(home, { recursive: true, force: true }));
}
