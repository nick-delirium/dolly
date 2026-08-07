import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  appendToSection,
  getBlock,
  getSection,
  parseFrontmatter,
  sectionNames,
  setBlock,
  setSection,
  stringifyFrontmatter,
} from '../dist/core/md.js';

test('frontmatter round-trips without coercing zero-padded ids', () => {
  const src = [
    '---',
    'id: "0007"',
    'slug: oauth-login',
    'title: Add OAuth login',
    'steps: 3',
    'stale: true',
    'collaborators: [alice, bob]',
    'tags: []',
    '---',
    '',
    '# body',
  ].join('\n');
  const { front, body } = parseFrontmatter(src);
  assert.equal(front.id, '0007');
  assert.equal(front.steps, 3);
  assert.equal(front.stale, true);
  assert.deepEqual(front.collaborators, ['alice', 'bob']);
  assert.deepEqual(front.tags, []);
  assert.equal(body.trim(), '# body');

  const again = parseFrontmatter(stringifyFrontmatter(front) + body).front;
  assert.deepEqual(again, front);
});

test('frontmatter parses block lists and quotes risky values', () => {
  const { front } = parseFrontmatter('---\ntags:\n  - a\n  - b\n---\nx');
  assert.deepEqual(front.tags, ['a', 'b']);
  const out = stringifyFrontmatter({ title: 'fix: the thing', id: '0001' });
  assert.match(out, /title: "fix: the thing"/);
  assert.match(out, /id: "0001"/);
});

test('missing frontmatter leaves the body untouched', () => {
  const { front, body } = parseFrontmatter('# just markdown\n');
  assert.deepEqual(front, {});
  assert.equal(body, '# just markdown\n');
});

test('sections are readable, replaceable and appendable', () => {
  const body = '# t\n\n## Spec\n\nold spec\n\n## Log\n\n_no steps yet_\n';
  assert.deepEqual(sectionNames(body), ['Spec', 'Log']);
  assert.equal(getSection(body, 'Spec'), 'old spec');

  const replaced = setSection(body, 'Spec', 'new spec');
  assert.equal(getSection(replaced, 'Spec'), 'new spec');
  assert.equal(getSection(replaced, 'Log'), '_no steps yet_');

  // placeholder is swallowed by the first append, later ones stack
  const one = appendToSection(replaced, 'Log', '### 0001\n\nfirst');
  assert.equal(getSection(one, 'Log'), '### 0001\n\nfirst');
  const two = appendToSection(one, 'Log', '### 0002\n\nsecond');
  assert.match(getSection(two, 'Log'), /### 0001[\s\S]*### 0002/);
  // appending to Log must not disturb Spec
  assert.equal(getSection(two, 'Spec'), 'new spec');
});

test('setSection creates a missing section at the end', () => {
  const out = setSection('# t\n\n## Spec\n\nx\n', 'Risks', 'none');
  assert.equal(getSection(out, 'Risks'), 'none');
  assert.deepEqual(sectionNames(out), ['Spec', 'Risks']);
});

test('marker blocks replace in place and are idempotent', () => {
  const a = setBlock('# doc\n', 'header', 'v1');
  assert.equal(getBlock(a, 'header'), 'v1');
  const b = setBlock(a, 'header', 'v2');
  assert.equal(getBlock(b, 'header'), 'v2');
  assert.equal(b.match(/<!-- dolly:header -->/g).length, 1);
  assert.equal(b.match(/<!-- \/dolly:header -->/g).length, 1);
  assert.match(b, /^# doc/);
});
