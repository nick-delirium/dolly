/**
 * Self-update. The passive notice tells a human they are behind; this is the
 * command that notice points at. One rule drives everything: update in the way
 * this copy was installed — a linked checkout is pulled and rebuilt, a registry
 * install is reinstalled from the dist-tag it follows (`latest` or `next`).
 *
 * Deliberately manual: nothing here ever runs on a timer or from a hook, so
 * "dolly never needs a network" still holds, and the binary never changes
 * under a running session unless a human asked for it.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { exists } from './fsx.js';
import { PKG_NAME, PKG_ROOT, VERSION } from './pkg.js';
import { channelOf, type InstallKind } from './update.js';

export interface UpdatePlan {
  kind: InstallKind;
  /** exact commands, in order, all run with cwd = package root */
  steps: string[][];
  /** why these commands and not others */
  reason: string;
}

/**
 * What updating this installation looks like, for the kind `installKind()`
 * detected. A registry install stays on its channel: someone on `next`
 * snapshots is never moved to releases behind their back, nor the reverse.
 */
export function planUpdate(kind: InstallKind, root = PKG_ROOT, version = installedVersion(root)): UpdatePlan {
  if (kind === 'clone') {
    return {
      kind,
      steps: [
        ['git', '-C', root, 'pull', '--ff-only'],
        ['npm', '--prefix', root, 'install'],
      ],
      reason:
        'this dolly runs from a git checkout (npm link or direct clone) — pull and rebuild in place',
    };
  }
  const tag = channelOf(version);
  return {
    kind,
    steps: [['npm', 'install', '-g', `${PKG_NAME}@${tag}`]],
    reason:
      tag === 'next'
        ? 'this dolly is a prerelease from npm — reinstall the newest `next` snapshot'
        : 'this dolly is a release from npm — reinstall the latest one',
  };
}

/** uncommitted work makes a pull fail or worse; surface it before touching anything */
export function dirtyClone(root = PKG_ROOT): string | null {
  if (!exists(root) || !exists(`${root}/.git`)) return null;
  try {
    const out = execFileSync('git', ['-C', root, 'status', '--porcelain'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const n = out.trim() ? out.trim().split('\n').length : 0;
    return n ? `${n} uncommitted change(s) in ${root}` : null;
  } catch {
    return null;
  }
}

/** run the plan step by step; combined output is returned for display */
export function applyPlan(plan: UpdatePlan, root = PKG_ROOT): string[] {
  const output: string[] = [];
  for (const [cmd, ...argv] of plan.steps) {
    const res = execFileSync(cmd, argv, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (res.trim()) output.push(res.trim());
  }
  return output;
}

/** version on disk right now — after a successful update this is the new one */
export function installedVersion(root = PKG_ROOT): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : VERSION;
  } catch {
    return VERSION;
  }
}
