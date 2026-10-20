import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { dollyHome } from '../dist/core/home.js';

test('the suite runs under a throwaway home, never the real one', () => {
  const home = process.env.DOLLY_TEST_HOME;
  assert.ok(home, 'run the suite with `npm test` — it preloads tests/isolate.mjs');
  assert.equal(path.dirname(home), fs.realpathSync(os.tmpdir()));
  assert.equal(os.homedir(), home);
  assert.equal(dollyHome(), home);
});
