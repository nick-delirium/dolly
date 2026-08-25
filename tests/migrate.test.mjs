import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { listBlocks } from '../dist/core/md.js';
import { Store } from '../dist/core/store.js';
import { createTask, fullSpec, logSection, setStatus, specHistory, stepEntries } from '../dist/core/task.js';
import { hasLegacyMarkers, migrate, rewriteMarkers } from '../dist/migrate.js';
import { addStep } from '../dist/core/task.js';
import { sandbox } from './helpers.mjs';
import fs2 from 'node:fs';
const readText = (f) => fs.readFileSync(f, 'utf8');

/** rewrite a current-format task into the pre-0.2 layout */
function downgrade(task) {
  const ctx = path.join(task.dir, 'context');
  fs.rmSync(path.join(ctx, 'steps.md'), { force: true });

  const stepsDir = path.join(ctx, 'steps');
  fs.mkdirSync(stepsDir, { recursive: true });
  fs.writeFileSync(
    path.join(stepsDir, '0001.md'),
    '<!-- dolly step 0001/0001 -->\n# Step 1\n\nfirst step full context\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(stepsDir, '0002.md'),
    '<!-- dolly step 0001/0002 -->\n# Step 2\n\nsecond step full context\n',
    'utf8',
  );

  fs.writeFileSync(path.join(ctx, 'spec.v1.md'), '<!-- dolly spec 0001 v1 -->\n\nthe v1 spec\n', 'utf8');
  fs.writeFileSync(
    path.join(ctx, 'spec.v2.md'),
    '<!-- dolly spec 0001 v2 -->\n\n> change reason: scope grew\n\nthe v2 spec\n',
    'utf8',
  );
  fs.writeFileSync(path.join(ctx, 'spec.md'), '<!-- dolly spec 0001 v2 -->\n\nthe v2 spec\n', 'utf8');

  // the old short-log shape pointed at per-step files
  const file = path.join(task.dir, 'task.md');
  const raw = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(
    file,
    raw
      .replace(/^spec_version: \d+$/m, 'spec_version: 2')
      .replace(
        /## Log[\s\S]*$/,
        [
          '## Log',
          '',
          '### 0001 · 2026-01-01 10:00Z · @tester',
          '',
          'first step summary',
          '',
          '- full: `context/steps/0001.md`',
          '',
          '### 0002 · 2026-01-01 11:00Z · @tester',
          '',
          'second step summary',
          '',
          '- full: `context/steps/0002.md`',
          '',
        ].join('\n'),
      ),
    'utf8',
  );
}

test('migrate merges per-step files and spec appendices into the current layout', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = createTask(store, { title: 'Legacy task', specFull: 'the v2 spec' });
  downgrade(task);

  // the fallback reader keeps an un-migrated store usable
  assert.equal(stepEntries(task.dir).length, 2, 'old layout is readable before migrating');

  const dry = migrate(Store.open(), { dryRun: true });
  // the chain reports its own hop alongside the per-task work
  for (const kind of ['chain', 'spec', 'steps']) {
    assert.ok(dry.actions.some((a) => a.kind === kind), `expected a ${kind} action`);
  }
  assert.ok(fs.existsSync(path.join(task.dir, 'context', 'steps')), 'dry run changes nothing');

  const report = migrate(Store.open());
  assert.ok(report.actions.some((a) => a.kind === 'steps'));
  assert.ok(report.actions.some((a) => a.kind === 'spec'));

  const ctx = path.join(task.dir, 'context');
  assert.deepEqual(fs.readdirSync(ctx).sort(), ['spec.md', 'steps.md']);

  const steps = fs.readFileSync(path.join(ctx, 'steps.md'), 'utf8');
  assert.deepEqual(listBlocks(steps, 'step'), ['0001', '0002']);
  assert.match(steps, /first step full context/);
  assert.match(steps, /second step full context/);

  const fresh = Store.open().loadTasks()[0];
  assert.match(fullSpec(fresh), /the v2 spec/);
  assert.match(specHistory(fresh), /## v1 —/);
  assert.match(specHistory(fresh), /> superseded: scope grew|the v1 spec/);

  // dead links in the short log are repointed at the merged file
  const log = logSection(fresh);
  assert.match(log, /full: `steps\.md#0001`/);
  assert.doesNotMatch(log, /context\/steps\/0001\.md/);

  assert.equal(migrate(Store.open()).actions.length, 0, 'migrate is idempotent');
});

test('migrate is a no-op on a current store', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  createTask(store, { title: 'Modern task' });
  assert.deepEqual(migrate(Store.open()).actions, []);
});

/* ------------------------- the dollie -> dolly rename ------------------------ */

/** a store exactly as the pre-rename version wrote it */
function plantLegacyStore(root) {
  const dir = path.join(root, '.dollie', 'tasks', '0001-old-task');
  fs.mkdirSync(path.join(dir, 'context'), { recursive: true });
  fs.writeFileSync(path.join(root, '.dollie', 'config.json'), '{"version":1}\n', 'utf8');
  fs.writeFileSync(
    path.join(root, '.dollie', 'README.md'),
    '# .dollie — shared task memory\n\nRead with `dollie board`.\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, 'task.md'),
    [
      '---',
      'id: "0001"',
      'slug: old-task',
      'title: Old task',
      'status: working',
      'owner: tester',
      'collaborators: [tester]',
      'tags: []',
      'steps: 2',
      'spec_version: 1',
      'created: 2026-01-01T10:00:00Z',
      'updated: 2026-01-01T12:00:00Z',
      '---',
      '',
      '# 0001 · Old task',
      '',
      '<!-- dollie:header -->',
      '`working` · spec v1 · @tester · 2 steps · updated 2026-01-01 12:00Z',
      '<!-- /dollie:header -->',
      '',
      '## Spec',
      '',
      'the old spec',
      '',
      '## Log',
      '',
      '- `2026-01-01 11:00Z` @tester: first thing landed.',
      '  full: `steps.md#0001`',
      '- `2026-01-01 12:00Z` @tester: second thing landed.',
      '  full: `steps.md#0002`',
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, 'context', 'spec.md'),
    [
      '<!-- dollie spec · task 0001 -->',
      '# Spec — Old task',
      '',
      '<!-- dollie:spec-current -->',
      '<!-- v1 · 2026-01-01T10:00:00Z · @tester -->',
      '',
      'the old spec body',
      '<!-- /dollie:spec-current -->',
      '',
      '<!-- dollie:spec-history -->',
      '_none — v1 is the first spec_',
      '<!-- /dollie:spec-history -->',
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, 'context', 'steps.md'),
    [
      '<!-- dollie steps · task 0001 · append-only, newest at the bottom -->',
      '# Full step context — Old task',
      '',
      '<!-- dollie:step 0001 -->',
      '## 0001 · 2026-01-01T11:00:00Z · @tester',
      '',
      'first step full context, mentions dollie in prose on purpose',
      '<!-- /dollie:step 0001 -->',
      '',
      '<!-- dollie:step 0002 -->',
      '## 0002 · 2026-01-01T12:00:00Z · @tester',
      '',
      'second step full context',
      '<!-- /dollie:step 0002 -->',
      '',
    ].join('\n'),
    'utf8',
  );
}

test('a pre-rename .dollie store is discovered, not reported missing', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  delete process.env.DOLLY_DIR;
  plantLegacyStore(sb.dir);

  const store = Store.open(sb.dir);
  assert.equal(store.legacy, true, 'flagged as pre-rename');
  assert.equal(path.basename(store.root), '.dollie');
  assert.equal(store.loadTasks().length, 1, 'the task is still readable before migrating');
  process.env.DOLLY_DIR = sb.store;
});

test('migrate moves the store, renames markers and keeps every step readable', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  delete process.env.DOLLY_DIR;
  plantLegacyStore(sb.dir);

  const dry = migrate(Store.open(sb.dir), { dryRun: true });
  assert.ok(dry.actions.some((a) => a.kind === 'store-rename'));
  assert.ok(fs.existsSync(path.join(sb.dir, '.dollie')), 'dry run moves nothing');

  const report = migrate(Store.open(sb.dir));
  assert.ok(report.actions.some((a) => a.kind === 'store-rename'));
  assert.ok(report.actions.some((a) => a.kind === 'markers'));
  assert.ok(report.actions.some((a) => a.kind === 'chain'));

  assert.equal(fs.existsSync(path.join(sb.dir, '.dollie')), false, 'old directory gone');
  assert.ok(fs.existsSync(path.join(sb.dir, '.dolly', 'config.json')), 'new directory in place');

  const migrated = Store.open(sb.dir);
  assert.equal(migrated.legacy, false);
  const task = migrated.loadTasks()[0];

  // the load-bearing assertion: step blocks are still parseable after the rename
  assert.deepEqual(stepEntries(task.dir).map((e) => e.id), ['0001', '0002']);
  assert.match(stepEntries(task.dir)[0].text, /first step full context/);
  assert.match(fullSpec(task), /the old spec body/);
  assert.match(logSection(task), /first thing landed/);

  const steps = fs.readFileSync(path.join(task.dir, 'context', 'steps.md'), 'utf8');
  assert.match(steps, /<!-- dolly:step 0001 -->/);
  assert.doesNotMatch(steps, /<!-- dollie:step/);
  // prose is a record of what someone wrote — it must NOT be rewritten
  assert.match(steps, /mentions dollie in prose on purpose/);

  // the store README is left alone: rewriting it on every migrate was pure
  // diff churn, and it is documentation rather than parsed structure
  assert.match(fs.readFileSync(path.join(sb.dir, '.dolly', 'README.md'), 'utf8'), /dollie/);

  assert.equal(migrate(Store.open(sb.dir)).actions.length, 0, 'idempotent');
  process.env.DOLLY_DIR = sb.store;
});

test('migrate reports an orphaned old store instead of ignoring or guessing', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  delete process.env.DOLLY_DIR;
  plantLegacyStore(sb.dir);
  // a .dolly/ already exists, so it wins the lookup and .dollie/ is an orphan
  fs.mkdirSync(path.join(sb.dir, '.dolly', 'tasks'), { recursive: true });

  const store = Store.open(sb.dir);
  assert.equal(store.legacy, false);
  assert.equal(path.basename(store.root), '.dolly');

  const report = migrate(store);
  const note = report.actions.find((a) => a.kind === 'store-rename');
  assert.ok(note, 'the orphan is reported');
  assert.match(note.detail, /also exists and was NOT touched/);
  assert.match(note.detail, /merge it/);
  assert.ok(fs.existsSync(path.join(sb.dir, '.dollie')), 'nothing destroyed');
  process.env.DOLLY_DIR = sb.store;
});

test('marker migration touches structure only, never prose', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);

  const doc = [
    '<!-- dollie:step 0001 -->',
    '## 0001 · a step',
    '',
    'I renamed the `<!-- dollie:header -->` marker and also `<!-- dollie:step 0002 -->`.',
    'Inline mentions like these are a record of what I wrote about the OLD name.',
    '<!-- /dollie:step 0001 -->',
  ].join('\n');

  const out = rewriteMarkers(doc);

  // the real markers move
  assert.match(out, /^<!-- dolly:step 0001 -->$/m);
  assert.match(out, /^<!-- \/dolly:step 0001 -->$/m);
  // the prose does not — including the marker-shaped text inside it
  assert.match(out, /I renamed the `<!-- dollie:header -->` marker and also `<!-- dollie:step 0002 -->`\./);
  // and no phantom block was created out of quoted text
  assert.deepEqual(listBlocks(out, 'step'), ['0001']);

  // an unknown marker name at line start is not dolly's, so it is left alone
  assert.equal(rewriteMarkers('<!-- dollie:something-else -->'), '<!-- dollie:something-else -->');
  // header comments dolly writes with a space are migrated
  assert.equal(
    rewriteMarkers('<!-- dollie spec · task 0001 -->'),
    '<!-- dolly spec · task 0001 -->',
  );
  assert.equal(hasLegacyMarkers('a line then <!-- dollie:header --> inline'), false);
  assert.equal(hasLegacyMarkers('<!-- dollie:header -->'), true);
});

test('migrate flattens archive/YYYY-MM/ back into tasks/ and drops the stamp', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  store.init();
  const task = createTask(store, { title: 'Old work', specShort: 's' });
  setStatus(store, task, 'done');
  // simulate a pre-v5 store: task moved under archive/, frontmatter stamped
  const bucket = path.join(sb.store, 'archive', '2026-07');
  fs.mkdirSync(bucket, { recursive: true });
  fs.renameSync(task.dir, path.join(bucket, path.basename(task.dir)));
  const file = path.join(bucket, path.basename(task.dir), 'task.md');
  fs.writeFileSync(file, readText(file).replace(/^status: done$/m, 'status: done\narchived: "2026-07-01T00:00:00Z"'));
  // an empty bucket must not block flattening
  fs.mkdirSync(path.join(sb.store, 'archive', '2026-06'), { recursive: true });

  const dry = migrate(Store.open(), { dryRun: true });
  assert.match(dry.actions.map((a) => a.detail).join('\n'), /archive\/2026-07\//, 'dry run previews the move');
  assert.equal(fs.existsSync(bucket), true, 'dry run moves nothing');

  migrate(Store.open());
  const back = Store.open().loadTasks().find((x) => x.meta.id === task.meta.id);
  assert.ok(back, 'archived task visible again');
  assert.equal(back.rel, `tasks/${path.basename(task.dir)}`);
  assert.doesNotMatch(readText(path.join(back.dir, 'task.md')), /^archived:/m, 'stamp dropped');
  assert.equal(fs.existsSync(path.join(sb.store, 'archive')), false, 'empty archive tree removed');

  const again = migrate(Store.open());
  assert.equal(again.actions.length, 0, 'idempotent');
});

test('migrate rewrites sequential ids to hash ids, references included', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  store.init();
  // build the pre-v6 fixture by hand: createTask already generates hash ids
  const oldId = '0001';
  const dir = path.join(sb.store, 'tasks', `${oldId}-legacy-id-here`);
  fs.mkdirSync(path.join(dir, 'context'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'task.md'),
    [
      '---',
      `id: ${oldId}`,
      'slug: legacy-id-here',
      'title: Legacy id here',
      'status: working',
      'owner: tester',
      'created: 2026-08-01T00:00:00Z',
      'updated: 2026-08-01T00:00:00Z',
      '---',
      '',
      `# ${oldId} · Legacy id here`,
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(dir, 'context', 'steps.md'),
    [
      `<!-- dolly steps · task ${oldId} · append-only -->`,
      '# Full step context',
      '',
      '<!-- dolly:step 0001 -->',
      'some work — full context',
      '<!-- /dolly:step 0001 -->',
      '',
    ].join('\n'),
  );

  const dry = migrate(Store.open(), { dryRun: true });
  assert.match(dry.actions.map((a) => a.detail).join('\n'), new RegExp(`${oldId} → `), 'dry run previews');
  assert.equal(fs.existsSync(dir), true, 'dry run renames nothing');

  migrate(Store.open());
  assert.equal(fs.existsSync(dir), false, 'old directory gone');
  const fresh = Store.open().loadTasks()[0];
  assert.match(fresh.meta.id, /^[23456789bcdfghjkmnpqrstvwxyz]{8}$/);
  assert.notEqual(fresh.meta.id, oldId);
  assert.equal(fresh.meta.title, 'Legacy id here');
  // the heading and the steps header comment follow the id; prose does not
  assert.match(fs.readFileSync(path.join(fresh.dir, 'task.md'), 'utf8'),
    new RegExp(`^# ${fresh.meta.id} · Legacy id here$`, 'm'));
  const steps = fs.readFileSync(path.join(fresh.dir, 'context', 'steps.md'), 'utf8');
  assert.match(steps, new RegExp(`<!-- dolly steps · task ${fresh.meta.id}\\b`));
  assert.doesNotMatch(steps, new RegExp(`task ${oldId}\\b`));
  // step entries keep their own numbers
  assert.deepEqual(stepEntries(fresh.dir).map((e) => e.id), ['0001']);

  const again = migrate(Store.open());
  assert.equal(again.actions.length, 0, 'idempotent');
});
