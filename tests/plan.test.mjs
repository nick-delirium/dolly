import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  addPlanQA,
  checkPlan,
  finalizePlan,
  readPlan,
  setPlanSection,
  startPlan,
} from '../dist/core/plan.js';
import { Store } from '../dist/core/store.js';
import { criteria, fullSpec, reload, shortSpec, specHistory } from '../dist/core/task.js';
import { sandbox } from './helpers.mjs';

function fillAll(store, task) {
  setPlanSection(store, task, 'Problem', 'Support scrolls 400 replays to find EU Safari bugs.');
  setPlanSection(store, task, 'Goal', 'Replay list filterable by country and browser, p95 < 300ms.');
  setPlanSection(
    store,
    task,
    'Scope',
    '**In:**\n\n- country filter\n- browser filter\n\n**Out:**\n\n- device filter',
  );
  setPlanSection(
    store,
    task,
    'Success Criteria',
    '- [ ] country filter returns only matching sessions\n- [ ] combined filters AND together',
  );
  setPlanSection(store, task, 'Changes', '- `api/search.ts` — where clauses\n- migration for index');
  setPlanSection(store, task, 'Risks', 'Index write cost. Fallback: partial index on last 30d.');
  setPlanSection(store, task, 'Test Plan', 'Unit: clause builder. Integration: search endpoint.');
  setPlanSection(store, task, 'Open Questions', 'none');
}

test('startPlan creates a planning task with a seeded interview', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = startPlan(store, 'Replay filters', 'filter replays by country and browser');

  assert.equal(task.meta.status, 'planning');
  const plan = readPlan(task);
  assert.match(plan, /# Plan — Replay filters/);
  assert.match(plan, /filter replays by country and browser/);
  for (const s of store.config.planSections) assert.match(plan, new RegExp(`## ${s}`));
  assert.ok(fs.existsSync(path.join(task.dir, 'context', 'plan.md')));
});

test('the gate treats seeded sections as unfilled, including bold sub-labels', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = startPlan(store, 'Gated', 'x');

  const first = checkPlan(store, task);
  assert.equal(first.ok, false);
  assert.deepEqual(first.missing, store.config.planSections);

  // the Scope seed is `**In:** / - _TBD_ / **Out:** / - _TBD_` — still unfilled
  setPlanSection(store, task, 'Scope', '**In:**\n\n- _TBD_\n\n**Out:**\n\n- _TBD_');
  assert.ok(checkPlan(store, task).missing.includes('Scope'));

  setPlanSection(store, task, 'Scope', '**In:**\n\n- the search endpoint\n\n**Out:**\n\n- the UI');
  assert.equal(checkPlan(store, task).missing.includes('Scope'), false);
});

test('unchecked open questions block the gate; checked or none pass', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = startPlan(store, 'Questions', 'x');
  fillAll(store, task);
  assert.equal(checkPlan(store, task).ok, true);

  setPlanSection(store, task, 'Open Questions', '- [ ] which auth provider?');
  const blocked = checkPlan(store, task);
  assert.equal(blocked.ok, false);
  assert.deepEqual(blocked.openQuestions, ['which auth provider?']);

  setPlanSection(store, task, 'Open Questions', '- [x] which auth provider? — GitHub');
  assert.equal(checkPlan(store, task).ok, true);
});

test('finalize is blocked while gaps remain and forced only on demand', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = startPlan(store, 'Blocked', 'x');

  const blocked = finalizePlan(store, task, {});
  assert.equal(blocked.ok, false);
  assert.equal(task.meta.status, 'planning');

  const forced = finalizePlan(store, task, { force: true });
  assert.equal(forced.ok, true);
  assert.equal(task.meta.status, 'todo');
});

test('finalize derives spec, criteria and Q&A decisions from the plan', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = startPlan(store, 'Replay filters', 'filter replays');
  fillAll(store, task);
  addPlanQA(store, task, 'Country from GeoIP or profile?', 'GeoIP at session start.');

  const res = finalizePlan(store, task);
  assert.equal(res.ok, true);
  assert.equal(task.meta.status, 'todo');
  assert.equal(task.meta.spec_version, 2);

  const fresh = reload(store, task);
  const spec = fullSpec(fresh);
  assert.match(spec, /## Problem/);
  assert.match(spec, /## Test Plan/);
  assert.match(spec, /## Decisions \(from planning Q&A\)/);
  assert.match(spec, /GeoIP at session start/);
  // interview prompts must never leak into the spec
  assert.doesNotMatch(spec, /<!-- ask:/);

  assert.match(shortSpec(fresh), /p95 < 300ms/);
  assert.match(shortSpec(fresh), /Out of scope: device filter\./);
  assert.match(criteria(fresh), /- \[ \] combined filters AND together/);

  // plan.md survives finalize as the interview record
  assert.match(readPlan(fresh), /## Q&A/);
  assert.deepEqual(fs.readdirSync(path.join(fresh.dir, 'context')).sort(), [
    'plan.md',
    'spec.md',
    'steps.md',
  ]);
  // the v1 placeholder spec is kept as a superseded version, not deleted
  assert.match(specHistory(fresh), /## v1 — /);
});

test('plan Q&A appends and replaces the placeholder', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  const task = startPlan(store, 'QA', 'x');
  addPlanQA(store, task, 'first?', 'yes');
  addPlanQA(store, task, 'second?', 'no');
  const plan = readPlan(task);
  assert.doesNotMatch(plan, /_none yet_/);
  assert.match(plan, /first\?[\s\S]*second\?/);
});
