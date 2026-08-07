import { execFileSync } from 'node:child_process';

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
