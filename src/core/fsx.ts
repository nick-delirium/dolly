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

export function readText(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

export function readTextOr(p: string, fallback = ''): string {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return fallback;
  }
}

/** write via temp file + rename so a crashed run never leaves a half file */
export function writeText(p: string, data: string): void {
  ensureDir(path.dirname(p));
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, p);
}

export function readJson<T>(p: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return fallback;
  }
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
