import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PromptCancelled,
  confirm,
  multiselect,
  select,
  text,
} from '../dist/prompt.js';

/** a Term whose keystrokes and typed lines are scripted */
function scriptTerm({ keys = [], lines = [], raw = true } = {}) {
  const out = [];
  return {
    raw,
    columns: 80,
    out,
    text: () => out.join(''),
    write: (s) => out.push(s),
    key: async () => {
      if (!keys.length) throw new Error('key input exhausted');
      const name = keys.shift();
      return name === 'c-c' ? { name: 'c', ctrl: true, seq: '\x03' } : { name, ctrl: false, seq: '' };
    },
    line: async () => {
      if (!lines.length) throw new Error('line input exhausted');
      return lines.shift();
    },
    close: () => {},
  };
}

const CHOICES = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana', hint: 'detected' },
  { value: 'c', label: 'Cherry' },
];

/* ------------------------------- arrow keys ------------------------------- */

test('arrow keys move and enter takes the highlighted choice', async () => {
  const term = scriptTerm({ keys: ['down', 'down', 'return'] });
  assert.equal(await select(term, { question: 'pick', choices: CHOICES }), 'c');
});

test('the cursor wraps at both ends', async () => {
  assert.equal(
    await select(scriptTerm({ keys: ['up', 'return'] }), { question: 'pick', choices: CHOICES }),
    'c',
  );
  assert.equal(
    await select(scriptTerm({ keys: ['down', 'down', 'down', 'return'] }), {
      question: 'pick',
      choices: CHOICES,
    }),
    'a',
  );
});

test('enter with no movement accepts the prefilled index', async () => {
  const term = scriptTerm({ keys: ['return'] });
  assert.equal(await select(term, { question: 'pick', choices: CHOICES, index: 1 }), 'b');
  assert.match(term.text(), /Banana/);
});

test('space toggles in multi-select, a checks all, n clears', async () => {
  assert.deepEqual(
    await multiselect(scriptTerm({ keys: ['space', 'down', 'down', 'space', 'return'] }), {
      question: 'pick many',
      choices: CHOICES,
    }),
    ['a', 'c'],
  );
  assert.deepEqual(
    await multiselect(scriptTerm({ keys: ['a', 'return'] }), { question: 'q', choices: CHOICES }),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(
    await multiselect(scriptTerm({ keys: ['n', 'return'] }), {
      question: 'q',
      choices: CHOICES,
      checked: ['a', 'b'],
    }),
    [],
  );
});

test('multi-select opens with the pre-checked values and enter keeps them', async () => {
  assert.deepEqual(
    await multiselect(scriptTerm({ keys: ['return'] }), {
      question: 'q',
      choices: CHOICES,
      checked: ['b'],
    }),
    ['b'],
  );
});

test('confirm answers on y / n, and enter takes the default', async () => {
  assert.equal(await confirm(scriptTerm({ keys: ['y'] }), { question: 'q', value: false }), true);
  assert.equal(await confirm(scriptTerm({ keys: ['n'] }), { question: 'q', value: true }), false);
  assert.equal(await confirm(scriptTerm({ keys: ['return'] }), { question: 'q', value: true }), true);
  assert.equal(await confirm(scriptTerm({ keys: ['return'] }), { question: 'q', value: false }), false);
});

test('a key that means nothing is ignored rather than treated as an answer', async () => {
  const term = scriptTerm({ keys: ['x', 'left', 'y'] });
  assert.equal(await confirm(term, { question: 'q', value: false }), true);
});

/* ---------------------------- numbered fallback --------------------------- */

test('without raw mode a selection is typed by number', async () => {
  const term = scriptTerm({ raw: false, lines: ['3'] });
  assert.equal(await select(term, { question: 'pick', choices: CHOICES }), 'c');
  assert.match(term.text(), /1\) Apple {2}— default/);
  assert.match(term.text(), /2\) Banana {2}— detected/);
});

test('an empty line takes the default in every fallback prompt', async () => {
  assert.equal(
    await select(scriptTerm({ raw: false, lines: [''] }), {
      question: 'pick',
      choices: CHOICES,
      index: 2,
    }),
    'c',
  );
  assert.equal(
    await confirm(scriptTerm({ raw: false, lines: [''] }), { question: 'q', value: true }),
    true,
  );
  assert.equal(
    await text(scriptTerm({ raw: false, lines: [''] }), { question: 'q', value: 'keep' }),
    'keep',
  );
});

test('garbage in the fallback re-asks instead of throwing', async () => {
  const term = scriptTerm({ raw: false, lines: ['nine', '0', '2'] });
  assert.equal(await select(term, { question: 'pick', choices: CHOICES }), 'b');
  assert.match(term.text(), /nine is not one of 1-3/);
  assert.match(term.text(), /0 is not one of 1-3/);
});

test('the fallback toggles several numbers at once, and a / n still work', async () => {
  assert.deepEqual(
    await multiselect(scriptTerm({ raw: false, lines: ['1,3', ''] }), {
      question: 'q',
      choices: CHOICES,
    }),
    ['a', 'c'],
  );
  assert.deepEqual(
    await multiselect(scriptTerm({ raw: false, lines: ['a', ''] }), {
      question: 'q',
      choices: CHOICES,
    }),
    ['a', 'b', 'c'],
  );
  const term = scriptTerm({ raw: false, lines: ['4', '2', ''] });
  assert.deepEqual(await multiselect(term, { question: 'q', choices: CHOICES }), ['b']);
  assert.match(term.text(), /not one of 1-3: 4/);
});

test('the fallback confirm insists on y or n', async () => {
  const term = scriptTerm({ raw: false, lines: ['maybe', 'no'] });
  assert.equal(await confirm(term, { question: 'q', value: true }), false);
  assert.match(term.text(), /answer y or n/);
});

/* -------------------------------- text ------------------------------------ */

test('text validates and re-asks until the answer passes', async () => {
  const term = scriptTerm({ raw: false, lines: ['', 'abc', '7'] });
  const value = await text(term, {
    question: 'days',
    validate: (s) => (/^\d+$/.test(s) ? null : 'whole number'),
  });
  assert.equal(value, '7');
  assert.equal(term.text().match(/whole number/g).length, 2);
});

test('text shows the default it will take', async () => {
  const term = scriptTerm({ raw: false, lines: [''] });
  assert.equal(await text(term, { question: 'handle', value: 'tester' }), 'tester');
  assert.match(term.text(), /\[tester\]/);
});

/* ------------------------------- cancelling -------------------------------- */

test('ctrl-c cancels every raw prompt', async () => {
  for (const run of [
    () => select(scriptTerm({ keys: ['c-c'] }), { question: 'q', choices: CHOICES }),
    () => multiselect(scriptTerm({ keys: ['c-c'] }), { question: 'q', choices: CHOICES }),
    () => confirm(scriptTerm({ keys: ['c-c'] }), { question: 'q', value: true }),
  ]) {
    await assert.rejects(run, PromptCancelled);
  }
});

/* -------------------------------- drawing --------------------------------- */

test('long lines are clipped so a redraw cannot lose count of its own rows', async () => {
  const term = scriptTerm({ keys: ['return'] });
  term.columns = 24;
  await select(term, {
    question: 'pick',
    choices: [{ value: 'x', label: 'a'.repeat(80), hint: 'b'.repeat(80) }],
  });
  // only the redrawn option rows matter: the one-line summary printed after the
  // list is never redrawn, so wrapping it costs nothing
  const listed = term
    .text()
    .split('\n')
    .map(stripAnsi)
    .filter((l) => /[◉○]/.test(l));
  assert.ok(listed.length > 0);
  for (const line of listed) assert.ok(line.length <= 24, `${line.length}: ${line}`);
});

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}
