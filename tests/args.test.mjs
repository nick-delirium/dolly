import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bool, list, num, parseArgs, repeated, str } from '../dist/core/args.js';

test('a value that starts with a dash is a value, not a flag', () => {
  // regression: markdown bullet lists are the normal shape of dolly prose, and
  // a lenient dash test made every character of them parse as a short flag
  const bullets = '- src/core/ — the model\n- src/cli.ts — commands';
  const a = parseArgs(['set', 'Architecture', '--text', bullets]);

  assert.deepEqual(a.positional, ['set', 'Architecture']);
  assert.equal(str(a, 'text'), bullets, 'the prose survives verbatim');
  assert.equal(a.flags.text, bullets, 'and is a string, not an array of "true"');
});

test('prose is never mistaken for a short-flag bundle', () => {
  const a = parseArgs(['-m', '- a bullet summary']);
  assert.equal(str(a, 'summary'), '- a bullet summary');
  // `t` aliases to `text`; a bundle misparse used to inject one "true" per `t`
  assert.equal(a.flags.text, undefined);
});

test('real flags still parse', () => {
  const a = parseArgs([
    'step', '3',
    '-m', 'did a thing',
    '--auto-files',
    '--files', 'a.ts,b.ts',
    '--limit', '5',
    '--detail-file', './notes.md',
  ]);
  assert.deepEqual(a.positional, ['step', '3']);
  assert.equal(str(a, 'summary'), 'did a thing');
  assert.equal(bool(a, 'auto-files'), true);
  assert.deepEqual(list(a, 'files'), ['a.ts', 'b.ts']);
  assert.equal(num(a, 'limit'), 5);
  assert.equal(str(a, 'detail-file'), './notes.md');
});

test('short bundles, = form, repeats, stdin dash and -- still work', () => {
  const bundle = parseArgs(['-xy', 'val']);
  assert.equal(bool(bundle, 'x'), true);
  assert.equal(str(bundle, 'y'), 'val', 'last letter of a bundle takes the value');

  // single letters alias to long names, so `-a` is `--answer`, not a flag named "a"
  const aliased = parseArgs(['-q', 'why?', '-a', 'because']);
  assert.equal(str(aliased, 'question'), 'why?');
  assert.equal(str(aliased, 'answer'), 'because');
  assert.equal(str(aliased, 'a'), undefined);

  assert.equal(str(parseArgs(['--reason=because']), 'reason'), 'because');
  assert.deepEqual(repeated(parseArgs(['--criteria', 'x, y', '--criteria', 'z']), 'criteria'), ['x, y', 'z']);
  assert.equal(str(parseArgs(['--file', '-']), 'file'), '-', 'a lone dash means stdin');
  assert.deepEqual(parseArgs(['--', '--not-a-flag']).positional, ['--not-a-flag']);

  // a flag followed by another flag is boolean
  const two = parseArgs(['--dry-run', '--json']);
  assert.equal(bool(two, 'dry-run'), true);
  assert.equal(bool(two, 'json'), true);
});

test('a negative number is a value', () => {
  assert.equal(num(parseArgs(['-n', '-1']), 'limit'), -1);
});
