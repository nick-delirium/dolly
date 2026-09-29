import fs from 'node:fs';
import path from 'node:path';

export function exists(p: string): boolean {
  try {
    fs.statSync(p);
    return true;
  } catch {
    return false;
  }
}

export function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

export function readTextOr(p: string, fallback = ''): string {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return fallback;
  }
}

/**
 * Where a write to `p` should land. A symlinked CLAUDE.md or a dotfiles-managed
 * settings.json must be written through, not replaced by a regular file — the
 * rename below would otherwise swap the link for a copy and leave the real file
 * untouched.
 */
function writeTarget(p: string): string {
  try {
    if (!fs.lstatSync(p).isSymbolicLink()) return p;
  } catch {
    return p;
  }
  try {
    return fs.realpathSync(p);
  } catch {
    // dangling link: write where it points, creating the file
    return path.resolve(path.dirname(p), fs.readlinkSync(p));
  }
}

/** write via temp file + rename so a crashed run never leaves a half file */
export function writeText(p: string, data: string): void {
  const target = writeTarget(p);
  ensureDir(path.dirname(target));
  const tmp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, target);
}

/**
 * Tolerant read: missing or unparseable → `fallback`. Only for values that are
 * read and never written back (caches, display). Anything that is read, changed
 * and saved must use {@link readJsonForUpdate} — a fallback written back over a
 * file that merely failed to parse erases the user's whole config.
 */
export function readJson<T>(p: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export class JsonFileError extends Error {
  readonly file: string;
  /** the file parses once comments and trailing commas are stripped */
  readonly jsonc: boolean;
  constructor(file: string, jsonc: boolean) {
    super(
      jsonc
        ? `${file} has comments or trailing commas — dolly will not rewrite it and drop them`
        : `${file} is not valid JSON (merge conflict? truncated?) — fix it by hand; dolly will not overwrite it`,
    );
    this.name = 'JsonFileError';
    this.file = file;
    this.jsonc = jsonc;
  }
}

/**
 * Read a JSON file that is about to be modified and written back. Missing or
 * empty → `fallback`; present but unparseable → {@link JsonFileError}, never the
 * fallback.
 */
export function readJsonForUpdate<T>(p: string, fallback: T): T {
  let raw: string;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch {
    return fallback;
  }
  if (!raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    let jsonc = false;
    try {
      JSON.parse(stripJsonc(raw));
      jsonc = true;
    } catch {
      /* broken either way */
    }
    throw new JsonFileError(p, jsonc);
  }
}

/** drop `//` and block comments outside strings, and trailing commas */
export function stripJsonc(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"') j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if (ch === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 2;
    } else {
      out += ch;
      i++;
    }
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

export function writeJson(p: string, data: unknown): void {
  writeText(p, `${JSON.stringify(data, null, 2)}\n`);
}

export function listDirs(p: string): string[] {
  try {
    return fs
      .readdirSync(p, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

export function listFiles(p: string): string[] {
  try {
    return fs
      .readdirSync(p, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

export function rmrf(p: string): void {
  fs.rmSync(p, { recursive: true, force: true });
}

export function move(from: string, to: string): void {
  ensureDir(path.dirname(to));
  try {
    fs.renameSync(from, to);
  } catch {
    // cross-device fallback
    fs.cpSync(from, to, { recursive: true });
    rmrf(from);
  }
}

export function readStdin(): string {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}
