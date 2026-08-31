import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fuzzyScore } from '../dist/core/fuzzy.js';
import { ID_ALPHABET, Store, newHashId } from '../dist/core/store.js';
import { createTask } from '../dist/core/task.js';
import { sandbox } from './helpers.mjs';

test('fuzzy score rewards boundaries and consecutive runs over scattered matches', () => {
  const exact = fuzzyScore('oauth login', 'oauth login');
  const boundary = fuzzyScore('oalog', 'add oauth-login helper');
  const scattered = fuzzyScore('oalog', 'board-alignment-of-gadgets');
  assert.ok(exact !== null && boundary !== null && scattered !== null);
  assert.ok(exact > boundary, 'exact beats partial');
  assert.ok(boundary > scattered, 'word boundaries beat mid-word gaps');
});

test('fuzzy score rejects non-subsequences', () => {
  assert.equal(fuzzyScore('xz', 'alpha feature'), null);
  assert.equal(fuzzyScore('', 'anything'), 0);
  assert.equal(fuzzyScore('toolongneedle', 'short'), null);
});

test('separators in the query match word edges, so spoken queries find slugs', () => {
  // the haystack has no spaces — a literal subsequence can never exist
  assert.ok(fuzzyScore('oa log', 'oauth-login') !== null);
  assert.ok(fuzzyScore('hash ids', 'hash-task-ids-fuzzy-title-matching') !== null);
  assert.ok(fuzzyScore('my_func', 'my-func-helper') !== null, '_ skips like any separator');
  assert.equal(fuzzyScore('oa log', 'log-oauth'), null, 'word order is still enforced');
  assert.equal(fuzzyScore('hash ids', 'daily memo command'), null);
  assert.equal(fuzzyScore('---', 'anything'), 0, 'separator-only needle has no opinion');
  // separators consume no haystack: only real characters count against length
  assert.equal(fuzzyScore('a b c d e f g h i j', 'abcdefgh'), null);
  assert.ok(fuzzyScore('a b c d e f g h', 'abcdefgh') !== null);
});

test('acronym tails are mid-word; camel humps and digit edges are boundaries', () => {
  // same landing position, only the boundary bonus differs
  assert.ok(fuzzyScore('t', 'X-t') > fuzzyScore('t', 'XXt'), 'after a separator is a boundary, inside an acronym run is not');
  assert.ok(fuzzyScore('B', 'aBcd') > fuzzyScore('c', 'aBcd'), 'camel hump beats the tail');
  assert.ok(fuzzyScore('2p', 'v2patch') > fuzzyScore('2p', 'v2xpatch'), 'letter↔digit edge wins');
});

test('newHashId draws from the vowel-free alphabet with fixed length', () => {
  for (let i = 0; i < 50; i++) {
    assert.match(newHashId(), new RegExp(`^[${ID_ALPHABET}]{8}$`));
  }
  assert.doesNotMatch(ID_ALPHABET, /[aeiou01il]/);
});

test('nextId never collides with an existing task id', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  store.init();
  const seen = new Set();
  for (let i = 0; i < 5; i++) {
    const id = store.nextId();
    assert.ok(!seen.has(id), `id ${id} repeated`);
    seen.add(id);
  }
});

test('search ranks prefix matches above substrings above fuzzy hits', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  store.init();
  createTask(store, { title: 'Board alignment of gadgets' });
  createTask(store, { title: 'Add oauth-login helper' });
  createTask(store, { title: 'Unrelated thing' });

  // "oalog" is not a substring anywhere — fuzzy must rank the oauth task first
  const hits = store.search('oalog');
  assert.equal(hits[0]?.meta.title, 'Add oauth-login helper');
  assert.ok(hits[1] === undefined || hits[0].meta.title !== hits[1].meta.title);

  const prefix = store.search('boa');
  assert.equal(prefix[0]?.meta.title, 'Board alignment of gadgets');

  // single letters match everything — they stay ambiguous, never auto-picked
  const both = store.search('a');
  assert.ok(both.length >= 2);
});

test('search resolves multi-word refs the way they are spoken', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  store.init();
  createTask(store, { title: 'Hash task ids + fuzzy title matching' });
  createTask(store, { title: 'Daily memo command' });

  assert.equal(store.search('hash ids')[0]?.meta.title, 'Hash task ids + fuzzy title matching');
  assert.equal(store.search('daily memo')[0]?.meta.title, 'Daily memo command');
  assert.equal(store.search('memo daily').length, 0, 'reversed word order finds nothing');
  assert.equal(store.search('ids fuzzy')[0]?.meta.title, 'Hash task ids + fuzzy title matching');
});

test('resolve throws AmbiguousRef carrying ranked candidates', (t) => {
  const sb = sandbox();
  t.after(sb.cleanup);
  const store = Store.open();
  store.init();
  createTask(store, { title: 'Add replay country filter' });
  createTask(store, { title: 'Add replay browser filter' });

  try {
    store.resolve('replay');
    assert.fail('expected AmbiguousRef');
  } catch (err) {
    assert.equal(err.name, 'AmbiguousRef');
    assert.equal(err.candidates.length, 2);
  }
});
