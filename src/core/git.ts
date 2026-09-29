import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { isDir } from './fsx.js';

function run(args: string[], cwd: string): string | null {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

export function repoRoot(cwd: string): string | null {
  return run(['rev-parse', '--show-toplevel'], cwd);
}

/**
 * Make `dir` a git repo if it is not one already, so the out-of-repo stores it
 * holds can be backed up and synced with a single push. Idempotent: an existing
 * repo (and its history) is left untouched. Best-effort — a missing git binary
 * must not break recording a store.
 */
export function ensureRepo(dir: string): void {
  if (isDir(path.join(dir, '.git'))) return;
  try {
    execFileSync('git', ['init', '-q', dir], { stdio: 'ignore' });
  } catch {
    /* no git, or init failed — storage still works, just not one-push syncable */
  }
}

/**
 * Absolute, symlink-resolved path of the shared git dir, identical across every
 * worktree of a repo (unlike show-toplevel, which is per worktree). git returns
 * it relative by default; --path-format=absolute (git 2.31+, 2021) makes it
 * absolute and fully resolves symlinks, so it matches the realpath'd keys
 * repoIdentity/projectKey compute. null outside a repo.
 */
export function commonDir(cwd: string): string | null {
  const abs = run(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd);
  // git before 2.31 does not know --path-format and ECHOES it back with exit 0,
  // so the output starts with the flag itself. Taken at face value every repo
  // shared one global store key, with a newline in its folder name.
  if (abs && !abs.startsWith('-') && path.isAbsolute(abs)) return abs;
  const rel = run(['rev-parse', '--git-common-dir'], cwd);
  if (!rel || rel.startsWith('-')) return null;
  const resolved = path.resolve(cwd, rel.split('\n').pop()!.trim());
  try {
    return fs.realpathSync(resolved);
  } catch {
    return resolved;
  }
}

export function gitConfig(key: string, cwd: string): string | null {
  const v = run(['config', '--get', key], cwd);
  return v || null;
}

/**
 * Files touched in the working tree plus staged changes, repo-relative. `-z`
 * keeps non-ASCII names literal (without it git prints them quoted and
 * octal-escaped), and `--full-name` makes untracked files repo-relative like
 * the diff output instead of relative to wherever the command ran.
 */
export function changedFiles(cwd: string): string[] {
  const out = new Set<string>();
  for (const args of [
    ['diff', '--name-only', '-z', 'HEAD'],
    ['diff', '--name-only', '-z', '--cached'],
    ['ls-files', '--others', '--exclude-standard', '--full-name', '-z'],
  ]) {
    const res = runRaw(args, cwd);
    if (!res) continue;
    for (const name of res.split('\0')) if (name) out.add(name);
  }
  return [...out].sort();
}

/** like run(), but untrimmed — NUL-separated output must stay intact */
function runRaw(args: string[], cwd: string): string | null {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}
