import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
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
  return run(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd);
}

export function gitConfig(key: string, cwd: string): string | null {
  const v = run(['config', '--get', key], cwd);
  return v || null;
}

/** files touched in the working tree plus staged changes, repo-relative */
export function changedFiles(cwd: string): string[] {
  const out = new Set<string>();
  for (const args of [
    ['diff', '--name-only', 'HEAD'],
    ['diff', '--name-only', '--cached'],
    ['ls-files', '--others', '--exclude-standard'],
  ]) {
    const res = run(args, cwd);
    if (!res) continue;
    for (const line of res.split('\n')) if (line.trim()) out.add(line.trim());
  }
  return [...out].sort();
}

export function currentBranch(cwd: string): string | null {
  return run(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
}

export function headSha(cwd: string): string | null {
  return run(['rev-parse', '--short', 'HEAD'], cwd);
}
