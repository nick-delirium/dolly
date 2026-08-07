export interface Args {
  positional: string[];
  flags: Record<string, string | boolean | string[]>;
}

const ALIASES: Record<string, string> = {
  m: 'summary',
  f: 'file',
  s: 'status',
  q: 'question',
  a: 'answer',
  t: 'text',
  n: 'limit',
  h: 'help',
  v: 'version',
};

/**
 * Does this token look like a flag rather than a value?
 *
 * Deliberately strict, because dolly's values are prose: markdown bullet lists
 * start with `- `, and a lenient "starts with a dash" test made
 * `--text "- item"` parse as a bare boolean followed by a short-flag bundle,
 * so every character of the prose became a flag. A flag is `--word` or a run of
 * letters like `-abc` — never anything containing a space or newline.
 */
function looksLikeFlag(tok: string): boolean {
  return /^--[A-Za-z]/.test(tok) || /^-[A-Za-z]+$/.test(tok);
}

export function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags: Record<string, string | boolean | string[]> = {};
  let i = 0;
  let noMoreFlags = false;

  const put = (key: string, value: string | boolean) => {
    const k = ALIASES[key] ?? key;
    const prev = flags[k];
    if (prev === undefined) flags[k] = value;
    else if (Array.isArray(prev)) prev.push(String(value));
    else flags[k] = [String(prev), String(value)];
  };

  while (i < argv.length) {
    const a = argv[i];
    if (noMoreFlags) {
      positional.push(a);
      i++;
      continue;
    }
    if (a === '--') {
      noMoreFlags = true;
      i++;
      continue;
    }
    if (a === '-') {
      positional.push(a);
      i++;
      continue;
    }
    if (a.startsWith('--')) {
      const body = a.slice(2);
      const eq = body.indexOf('=');
      if (eq !== -1) {
        put(body.slice(0, eq), body.slice(eq + 1));
        i++;
        continue;
      }
      const next = argv[i + 1];
      if (next !== undefined && !looksLikeFlag(next)) {
        put(body, next);
        i += 2;
      } else {
        put(body, true);
        i++;
      }
      continue;
    }
    // only a real short-flag bundle: `-abc`, never a line of prose that
    // happens to begin with a dash
    if (/^-[A-Za-z]+$/.test(a)) {
      const letters = a.slice(1);
      for (let k = 0; k < letters.length; k++) {
        const last = k === letters.length - 1;
        const next = argv[i + 1];
        if (last && next !== undefined && !looksLikeFlag(next)) {
          put(letters[k], next);
          i++;
        } else {
          put(letters[k], true);
        }
      }
      i++;
      continue;
    }
    positional.push(a);
    i++;
  }
  return { positional, flags };
}

export function str(args: Args, key: string): string | undefined {
  const v = args.flags[key];
  if (v === undefined || v === true) return undefined;
  if (Array.isArray(v)) return v.join('\n');
  return v === false ? undefined : v;
}

export function bool(args: Args, key: string): boolean {
  return args.flags[key] === true || args.flags[key] === 'true';
}

export function num(args: Args, key: string): number | undefined {
  const v = str(args, key);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Repeated flag values, kept whole. For prose values — a success criterion is a
 * sentence and may contain commas, so it must never be split on them.
 */
export function repeated(args: Args, key: string): string[] {
  const v = args.flags[key];
  if (v === undefined || typeof v === 'boolean') return [];
  return (Array.isArray(v) ? v : [v]).map((x) => x.trim()).filter(Boolean);
}

/** repeated flag values, additionally split on commas — for paths and tags */
export function list(args: Args, key: string): string[] {
  const v = args.flags[key];
  if (v === undefined || typeof v === 'boolean') return [];
  const raw = Array.isArray(v) ? v : [v];
  return raw
    .flatMap((x) => x.split(','))
    .map((x) => x.trim())
    .filter(Boolean);
}
