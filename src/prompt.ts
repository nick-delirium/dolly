/**
 * Terminal prompts, hand-rolled.
 *
 * dolly has zero runtime dependencies and this is not the feature that earns
 * the first one — a select list, a checkbox list, a yes/no and a line of text
 * is the whole surface, and `node:readline` already decodes keys for us.
 *
 * Two input paths, both first-class:
 *  - raw mode: arrow keys, live redraw. What a person gets in a real terminal.
 *  - numbered: a question, a numbered list, a typed answer. What everything
 *    else gets — `TERM=dumb`, mintty, an IDE terminal that cannot do raw mode.
 *
 * The path is chosen by capability, never by platform sniffing, and both drive
 * the same functions so the wizard cannot drift between them.
 *
 * Everything talks to a `Term`, never to `process.stdout` — that is what lets a
 * test script the keystrokes and read back exactly what was drawn.
 */
import readline from 'node:readline';
import { color } from './core/render.js';

export class PromptCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'PromptCancelled';
  }
}

export interface Key {
  /** readline's key name: up, down, return, space, escape, backspace, a letter… */
  name: string;
  ctrl: boolean;
  seq: string;
}

export interface Term {
  write(s: string): void;
  /** next decoded keypress; only called when `raw` is true */
  key(): Promise<Key>;
  /** next line of typed input, newline stripped */
  line(): Promise<string>;
  /** whether the arrow-key path is available at all */
  raw: boolean;
  columns: number;
  close(): void;
}

export interface Choice<T> {
  value: T;
  label: string;
  hint?: string;
}

/* ------------------------------ real terminal ----------------------------- */

type In = NodeJS.ReadStream;
type Out = NodeJS.WriteStream;

export function stdioTerm(input: In = process.stdin, output: Out = process.stdout): Term {
  const canRaw =
    Boolean(input.isTTY) &&
    typeof input.setRawMode === 'function' &&
    Boolean(output.isTTY) &&
    process.env.TERM !== 'dumb';

  const pending: Key[] = [];
  let waiting: ((k: Key) => void) | null = null;
  let keysOn = false;
  /** bytes read past the newline a previous line() returned, kept for the next one */
  let carry = '';

  const onKeypress = (ch: string | undefined, k: readline.Key | undefined) => {
    const key: Key = {
      name: k?.name ?? (ch === ' ' ? 'space' : 'char'),
      ctrl: Boolean(k?.ctrl),
      seq: k?.sequence ?? ch ?? '',
    };
    if (waiting) {
      const w = waiting;
      waiting = null;
      w(key);
    } else {
      pending.push(key);
    }
  };

  const keysOff = () => {
    if (!keysOn) return;
    input.off('keypress', onKeypress);
    if (input.isTTY) input.setRawMode(false);
    input.pause();
    keysOn = false;
  };

  const keysStart = () => {
    if (keysOn) return;
    readline.emitKeypressEvents(input);
    if (input.isTTY) input.setRawMode(true);
    input.resume();
    input.on('keypress', onKeypress);
    keysOn = true;
  };

  // A terminal left in raw mode outlives the process and makes the user's shell
  // unusable, so the restore is bound to exit as well as to the normal path.
  const restore = () => keysOff();
  process.once('exit', restore);

  return {
    raw: canRaw,
    get columns() {
      return output.columns || 80;
    },
    write: (s) => void output.write(s),
    key() {
      keysStart();
      const buffered = pending.shift();
      if (buffered) return Promise.resolve(buffered);
      return new Promise<Key>((resolve) => {
        waiting = resolve;
      });
    },
    line() {
      // Keystrokes buffered by the previous raw-mode prompt belong to this line,
      // not to the void: a fast typist, a held enter, or piped input all arrive
      // before the switch out of raw mode and would otherwise look like a hang.
      const carried: string[] = [];
      while (pending.length) {
        const k = pending.shift() as Key;
        if (k.name === 'return' || k.name === 'enter') {
          keysOff();
          return Promise.resolve(carried.join(''));
        }
        if (k.seq && !k.ctrl && k.seq.length === 1) carried.push(k.seq);
      }
      keysOff();

      // A chunk can hold more than one line — pasted or piped input arrives all
      // at once. Anything past this line's newline belongs to the next prompt,
      // so it is kept rather than dropped on the floor.
      const take = (buf: string): string | null => {
        const nl = buf.indexOf('\n');
        if (nl === -1) {
          carry = buf;
          return null;
        }
        carry = buf.slice(nl + 1);
        return buf.slice(0, nl).replace(/\r$/, '');
      };

      const seeded = carried.join('') + carry;
      carry = '';
      const ready = take(seeded);
      if (ready !== null) return Promise.resolve(ready);

      return new Promise<string>((resolve) => {
        const onData = (chunk: Buffer | string) => {
          const line = take(carry + String(chunk));
          if (line === null) return;
          input.off('data', onData);
          input.pause();
          resolve(line);
        };
        input.on('data', onData);
        input.resume();
      });
    },
    close() {
      keysOff();
      process.off('exit', restore);
    },
  };
}

/* -------------------------------- drawing --------------------------------- */

const POINTER = '❯';
const ON = '◉';
const OFF = '○';
const CHECKED = '◼';
const UNCHECKED = '◻';

function clip(s: string, cols: number): string {
  // clipped before colouring: escape sequences would corrupt the length maths,
  // and an over-long line wraps, which breaks the redraw's line accounting
  return s.length > cols - 1 ? `${s.slice(0, Math.max(0, cols - 2))}…` : s;
}

function eraseLines(term: Term, n: number): void {
  if (n > 0) term.write(`\x1b[${n}A\x1b[0J`);
}

function optionLine(mark: string, label: string, hint: string | undefined, active: boolean, cols: number): string {
  const head = `${active ? POINTER : ' '} ${mark} ${label}`;
  const tail = hint ? `  — ${hint}` : '';
  const line = clip(head + tail, cols);
  if (active) return color.cyan(line);
  // Composed from the parts rather than by replacing the hint inside the line:
  // a hint that also occurs in the label would dim the wrong span, and a clipped
  // hint would not be found at all.
  return tail && line === head + tail ? `${head}${color.dim(tail)}` : line;
}

function answered(question: string, answer: string): string {
  return `${color.green('✓')} ${question} ${color.bold(answer)}\n`;
}

/* -------------------------------- prompts --------------------------------- */

export interface SelectOpts<T> {
  question: string;
  choices: Choice<T>[];
  /** index shown selected when the prompt opens; enter accepts it */
  index?: number;
}

export async function select<T>(term: Term, opts: SelectOpts<T>): Promise<T> {
  const { question, choices } = opts;
  if (!choices.length) throw new Error(`select "${question}" has no choices`);
  let i = Math.min(Math.max(opts.index ?? 0, 0), choices.length - 1);
  if (!term.raw) return selectNumbered(term, opts, i);

  const draw = () => {
    const lines = [
      `${color.bold(question)}`,
      ...choices.map((c, n) => optionLine(n === i ? ON : OFF, c.label, c.hint, n === i, term.columns)),
      color.dim('↑↓ move · enter select'),
    ];
    term.write(`${lines.join('\n')}\n`);
    return lines.length;
  };

  let drawn = draw();
  for (;;) {
    const k = await term.key();
    if (k.ctrl && k.name === 'c') throw new PromptCancelled();
    if (k.name === 'up' || k.name === 'k') i = (i - 1 + choices.length) % choices.length;
    else if (k.name === 'down' || k.name === 'j') i = (i + 1) % choices.length;
    else if (k.name === 'return' || k.name === 'enter') {
      eraseLines(term, drawn);
      term.write(answered(question, choices[i].label));
      return choices[i].value;
    }
    eraseLines(term, drawn);
    drawn = draw();
  }
}

async function selectNumbered<T>(term: Term, opts: SelectOpts<T>, i: number): Promise<T> {
  const { question, choices } = opts;
  for (;;) {
    term.write(`${question}\n`);
    choices.forEach((c, n) => {
      const tail = [c.hint, n === i ? 'default' : null].filter(Boolean).join(' · ');
      term.write(clip(`  ${n + 1}) ${c.label}${tail ? `  — ${tail}` : ''}`, term.columns) + '\n');
    });
    term.write('> ');
    const raw = (await term.line()).trim();
    if (!raw) return choices[i].value;
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 1 && n <= choices.length) return choices[n - 1].value;
    term.write(`  ${raw} is not one of 1-${choices.length}\n`);
  }
}

export interface MultiOpts<T> {
  question: string;
  choices: Choice<T>[];
  /** pre-checked values; anything not listed starts unchecked */
  checked?: T[];
}

export async function multiselect<T>(term: Term, opts: MultiOpts<T>): Promise<T[]> {
  const { question, choices } = opts;
  const on = choices.map((c) => (opts.checked ?? []).includes(c.value));
  const picked = () => choices.filter((_, n) => on[n]).map((c) => c.value);
  const summary = () => {
    const labels = choices.filter((_, n) => on[n]).map((c) => c.label);
    return labels.length ? labels.join(', ') : 'none';
  };
  if (!term.raw) return multiNumbered(term, opts, on);

  let i = 0;
  const draw = () => {
    const lines = [
      `${color.bold(question)}`,
      ...choices.map((c, n) => optionLine(on[n] ? CHECKED : UNCHECKED, c.label, c.hint, n === i, term.columns)),
      color.dim('↑↓ move · space toggle · a all · n none · enter confirm'),
    ];
    term.write(`${lines.join('\n')}\n`);
    return lines.length;
  };

  let drawn = draw();
  for (;;) {
    const k = await term.key();
    if (k.ctrl && k.name === 'c') throw new PromptCancelled();
    if (k.name === 'up' || k.name === 'k') i = (i - 1 + choices.length) % choices.length;
    else if (k.name === 'down' || k.name === 'j') i = (i + 1) % choices.length;
    else if (k.name === 'space') on[i] = !on[i];
    else if (k.name === 'a') on.fill(true);
    else if (k.name === 'n') on.fill(false);
    else if (k.name === 'return' || k.name === 'enter') {
      eraseLines(term, drawn);
      term.write(answered(question, summary()));
      return picked();
    }
    eraseLines(term, drawn);
    drawn = draw();
  }
}

async function multiNumbered<T>(term: Term, opts: MultiOpts<T>, on: boolean[]): Promise<T[]> {
  const { question, choices } = opts;
  for (;;) {
    term.write(`${question}\n`);
    choices.forEach((c, n) => {
      term.write(
        clip(`  ${n + 1}) [${on[n] ? 'x' : ' '}] ${c.label}${c.hint ? `  — ${c.hint}` : ''}`, term.columns) + '\n',
      );
    });
    term.write(`${color.dim('numbers to toggle (1,3) · a = all · n = none · enter = keep as shown')}\n> `);
    const raw = (await term.line()).trim().toLowerCase();
    if (!raw) return choices.filter((_, n) => on[n]).map((c) => c.value);
    if (raw === 'a') {
      on.fill(true);
      continue;
    }
    if (raw === 'n') {
      on.fill(false);
      continue;
    }
    const nums = raw.split(/[\s,]+/).filter(Boolean).map(Number);
    const bad = nums.filter((n) => !Number.isInteger(n) || n < 1 || n > choices.length);
    if (bad.length) {
      term.write(`  not one of 1-${choices.length}: ${bad.join(', ')}\n`);
      continue;
    }
    for (const n of nums) on[n - 1] = !on[n - 1];
  }
}

export async function confirm(term: Term, opts: { question: string; value: boolean }): Promise<boolean> {
  const hint = opts.value ? '[Y/n]' : '[y/N]';
  if (!term.raw) {
    for (;;) {
      term.write(`${opts.question} ${color.dim(hint)} `);
      const raw = (await term.line()).trim().toLowerCase();
      if (!raw) return opts.value;
      if (raw === 'y' || raw === 'yes') return true;
      if (raw === 'n' || raw === 'no') return false;
      term.write('  answer y or n\n');
    }
  }
  term.write(`${color.bold(opts.question)} ${color.dim(hint)} `);
  for (;;) {
    const k = await term.key();
    if (k.ctrl && k.name === 'c') throw new PromptCancelled();
    let value: boolean | null = null;
    if (k.name === 'y') value = true;
    else if (k.name === 'n') value = false;
    else if (k.name === 'return' || k.name === 'enter') value = opts.value;
    if (value === null) continue;
    term.write('\r\x1b[0K');
    term.write(answered(opts.question, value ? 'yes' : 'no'));
    return value;
  }
}

export async function text(
  term: Term,
  opts: { question: string; value?: string; validate?: (s: string) => string | null },
): Promise<string> {
  for (;;) {
    const suffix = opts.value ? ` ${color.dim(`[${opts.value}]`)}` : '';
    term.write(`${term.raw ? color.bold(opts.question) : opts.question}${suffix}\n> `);
    const raw = (await term.line()).trim();
    const value = raw || opts.value || '';
    const err = opts.validate?.(value);
    if (err) {
      term.write(`  ${err}\n`);
      continue;
    }
    return value;
  }
}

/** a plain heading between groups of prompts */
export function heading(term: Term, s: string): void {
  term.write(`\n${color.bold(s)}\n`);
}

export function note(term: Term, s: string): void {
  term.write(`${color.dim(s)}\n`);
}
