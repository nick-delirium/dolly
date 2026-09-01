import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PromptCancelled, filterSelect } from '../dist/prompt.js';

/**
 * Scripted raw-mode term: `keys` entries are either key names ('down',
 * 'return', 'backspace') or single characters to type. Each key sees the text
 * drawn so far via `seen()`, so replies can be conditional like the wizard's.
 */
function keyTerm(keys) {
  const out = [];
  const queue = [...keys];
  let seenMark = 0;
  return {
    raw: true,
    columns: 100,
    text: () => out.join(''),
    write: (s) => out.push(s),
    key: async () => {
      const k = queue.length ? queue.shift() : 'return';
      if (k === 'c-c') return { name: 'c', ctrl: true, seq: '\x03' };
      if (k.length === 1) return { name: 'char', ctrl: false, seq: k };
      return { name: k, ctrl: false, seq: '' };
    },
    line: async () => '',
    close: () => {},
  };
}

test('filterSelect live-filters as you type and picks the highlighted row', async () => {
  const term = keyTerm(['d', 'a', 'i', 'return']);
  const picked = await filterSelect(term, {
    question: 'Which task?',
    choices: [
      { value: 1, label: 'hash ids' },
      { value: 2, label: 'daily memo' },
      { value: 3, label: 'scrap archiving' },
    ],
  });
  assert.equal(picked, 2, 'typing "dai" narrows to the daily memo task');
});

test('filterSelect arrows move within the filtered list', async () => {
  // "a" is a substring of both labels; down moves to the second hit before enter
  const term = keyTerm(['a', 'down', 'return']);
  const picked = await filterSelect(term, {
    question: 'Which task?',
    choices: [
      { value: 1, label: 'archiving' },
      { value: 2, label: 'hash table' },
    ],
  });
  assert.equal(picked, 2);
});

test('filterSelect narrows by the fuzzy matcher when no substring hits', async () => {
  // "hid" is not a substring of any label — fuzzy must rank "hash ids" first
  const term = keyTerm(['h', 'i', 'd', 'return']);
  const picked = await filterSelect(term, {
    question: 'Which task?',
    choices: [
      { value: 1, label: 'hash ids task' },
      { value: 2, label: 'daily memo' },
    ],
  });
  assert.equal(picked, 1, '"hid" finds the hash-ids task across separators');
});

/** Non-raw term whose stdin is exhausted: every line() resolves empty, as at EOF. */
function eofTerm() {
  const out = [];
  return {
    raw: false,
    columns: 100,
    text: () => out.join(''),
    write: (s) => out.push(s),
    key: async () => ({ name: 'return', ctrl: false, seq: '' }),
    line: async () => '',
    close: () => {},
  };
}

test('the numbered fallback cancels on an empty line instead of looping forever', async () => {
  // a closed stdin resolves every line() empty; looping on that spins the CPU
  // and starves the event loop, so the process never exits
  const term = eofTerm();
  await assert.rejects(
    () =>
      filterSelect(term, {
        question: 'Which task?',
        choices: [
          { value: 1, label: 'one' },
          { value: 2, label: 'two' },
        ],
      }),
    PromptCancelled,
  );
  assert.match(term.text(), /1\) one/, 'the candidates are still shown before giving up');
});

test('the numbered fallback takes a number and re-asks on anything else', async () => {
  const replies = ['nope', '2'];
  const out = [];
  const term = {
    raw: false,
    columns: 100,
    text: () => out.join(''),
    write: (s) => out.push(s),
    key: async () => ({ name: 'return', ctrl: false, seq: '' }),
    line: async () => replies.shift() ?? '',
    close: () => {},
  };
  const picked = await filterSelect(term, {
    question: 'Which task?',
    choices: [
      { value: 1, label: 'one' },
      { value: 2, label: 'two' },
    ],
  });
  assert.equal(picked, 2);
  assert.match(term.text(), /nope is not one of 1-2/);
});

test('filterSelect escape cancels', async () => {
  const term = keyTerm(['escape']);
  await assert.rejects(
    () =>
      filterSelect(term, {
        question: 'Which task?',
        choices: [{ value: 1, label: 'one' }],
      }),
    PromptCancelled,
  );
});
