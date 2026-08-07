import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { Store, storeVersion } from '../dist/core/store.js';
import { createTask } from '../dist/core/task.js';
import { STORE_VERSION } from '../dist/core/types.js';
import { maybeAutoMigrate, migrate, pending, versionState } from '../dist/migrate.js';
import { sandbox } from './helpers.mjs';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');

/** both streams — the version warnings are on stderr by design */
function run(cwd, args, env = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, DOLLY_USER: 'tester', NO_COLOR: '1', ...env },
  });
  return { out: `${r.stdout ?? ''}${r.stderr ?? ''}`, code: r.status };
}
const setVersion = (store, v) => {
  const f = path.join(store, 'config.json');
  const cfg = JSON.parse(fs.readFileSync(f, 'utf8'));
  cfg.version = v;
  fs.writeFileSync(f, JSON.stringify(cfg, null, 2), 'utf8');
};

test('a fresh store is stamped with the current schema version', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  assert.equal(storeVersion(sb.store), STORE_VERSION);
  assert.deepEqual(pending(Store.open()), [], 'nothing to migrate');
  assert.equal(versionState(Store.open()).newer, false);
});

test('a safe migration runs unattended and stamps the version', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  createTask(Store.open(), { title: 'Existing work' });

  // an old store: stale version, identity in the shared config, thin .gitignore
  setVersion(sb.store, 1);
  const cfgPath = path.join(sb.store, 'config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  cfg.user = 'someone-else';
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf8');
  fs.writeFileSync(path.join(sb.store, '.gitignore'), '.housekeep.json\n', 'utf8');

  const p = pending(Store.open());
  assert.equal(p.length, 1);
  assert.equal(p[0].migration.safe, true, 'identity + scaffolding is lossless');

  const applied = maybeAutoMigrate(Store.open());
  assert.ok(applied.length, 'applied without being asked');
  assert.equal(storeVersion(sb.store), STORE_VERSION, 'and stamped, since nothing is left pending');
  assert.equal(Store.open().config.user, 'someone-else', 'identity preserved in local.json');
  assert.deepEqual(pending(Store.open()), []);
  assert.equal(maybeAutoMigrate(Store.open()).length, 0, 'idempotent');
});

test('a risky migration is never applied unattended, and keeps warning', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  const task = createTask(Store.open(), { title: 'Legacy layout' });
  // pre-0.2 fingerprint: a per-step file
  fs.mkdirSync(path.join(task.dir, 'context', 'steps'), { recursive: true });
  fs.writeFileSync(path.join(task.dir, 'context', 'steps', '0001.md'), '# Step 1\n\nbody\n', 'utf8');
  setVersion(sb.store, 1);

  const risky = versionState(Store.open()).unsafePending;
  assert.equal(risky.length, 1);
  assert.match(risky[0].migration.name, /merged layout/);

  assert.equal(maybeAutoMigrate(Store.open()).length, 0, 'not touched automatically');
  assert.ok(fs.existsSync(path.join(task.dir, 'context', 'steps')), 'still there');
  assert.equal(storeVersion(sb.store), 1, 'version NOT stamped while work is pending');

  // the CLI says so on an ordinary command, without failing
  const board = run(sb.dir, ['board'], { DOLLY_DIR: sb.store });
  assert.equal(board.code, 0, 'a pending risky migration warns, it does not block reads');
  assert.match(board.out, /dolly migrate/);
  assert.match(board.out, /merged layout/);

  // explicit migrate applies it and stamps
  migrate(Store.open());
  assert.equal(fs.existsSync(path.join(task.dir, 'context', 'steps')), false);
  assert.equal(storeVersion(sb.store), STORE_VERSION);
});

test('a store from a newer dolly refuses writes but still reads', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  createTask(Store.open(), { title: 'From the future' });
  setVersion(sb.store, STORE_VERSION + 5);

  assert.equal(versionState(Store.open()).newer, true);

  const write = run(sb.dir, ['step', '1', '-m', 'nope'], { DOLLY_DIR: sb.store });
  assert.equal(write.code, 1, 'a write must fail');
  assert.match(write.out, new RegExp(`schema version ${STORE_VERSION + 5}`));
  assert.match(write.out, /upgrade dolly/);

  const read = run(sb.dir, ['board'], { DOLLY_DIR: sb.store });
  assert.equal(read.code, 0);
  assert.match(read.out, /From the future/, 'reads still work');
  assert.match(read.out, /Reading anyway/);

  // and migrate refuses to downgrade rather than mangling a teammate's store
  assert.throws(() => migrate(Store.open()), /upgrade dolly instead of migrating down/);
  assert.equal(storeVersion(sb.store), STORE_VERSION + 5, 'untouched');
});

test('dry run reports the chain and the stamp without writing', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  setVersion(sb.store, 1);

  const report = migrate(Store.open(), { dryRun: true });
  assert.ok(report.actions.some((a) => a.kind === 'chain' && /would stamp/.test(a.detail)));
  assert.equal(storeVersion(sb.store), 1, 'nothing written');
});

test('a store that is already current but stamped stale gets stamped, silently', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  Store.open().init();
  createTask(Store.open(), { title: 'Fine already' });

  // migrated by hand, or created before the stamp existed
  setVersion(sb.store, 1);
  assert.deepEqual(pending(Store.open()), [], 'structurally nothing to do');

  const applied = maybeAutoMigrate(Store.open());
  assert.deepEqual(applied, [], 'nothing to report');
  assert.equal(storeVersion(sb.store), STORE_VERSION, 'but the stamp is brought up to date');

  // otherwise every command re-evaluates the whole chain forever
  const board = run(sb.dir, ['board'], { DOLLY_DIR: sb.store });
  assert.equal(board.code, 0);
  assert.doesNotMatch(board.out, /migrate/, 'and says nothing about migrating');
});
