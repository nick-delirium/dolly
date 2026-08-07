import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { gitConfig } from './git.js';
import { exists, readJson, writeJson } from './fsx.js';

const CACHE = path.join(os.homedir(), '.dolly', 'identity.json');

interface IdentityCache {
  user: string;
  source: string;
  at: string;
}

function fromGh(): string | null {
  try {
    const out = execFileSync('gh', ['api', 'user', '--jq', '.login'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 4000,
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

/** git remote URLs carry the owner, not the author — only used as a weak hint */
function fromGit(cwd: string): string | null {
  const email = gitConfig('user.email', cwd);
  if (email) {
    // github noreply addresses carry the handle: 12345+handle@users.noreply...
    const m = /^([^@]+)@users\.noreply\.github\.com$/.exec(email);
    if (m) return m[1].replace(/^\d+\+/, '');
    const local = email.split('@')[0];
    if (local) return local;
  }
  // no email configured: a name is still better than $USER, which is often
  // just the laptop's account and identical across a team's CI
  const name = gitConfig('user.name', cwd);
  return name ? name.trim().replace(/\s+/g, '-').toLowerCase() : null;
}

export interface Identity {
  user: string;
  source: 'env' | 'config' | 'gh' | 'git' | 'os';
}

/**
 * Resolve the handle stamped on every step. Preference order:
 * DOLLY_USER -> store config.user -> `gh api user` (cached) -> git email -> $USER
 */
export function resolveIdentity(cwd: string, configUser?: string | null): Identity {
  const env = process.env.DOLLY_USER?.trim() || process.env.DOLLIE_USER?.trim();
  if (env) return { user: env, source: 'env' };
  if (configUser) return { user: configUser, source: 'config' };

  if (exists(CACHE)) {
    const c = readJson<IdentityCache | null>(CACHE, null);
    if (c?.user) return { user: c.user, source: 'gh' };
  }
  const gh = fromGh();
  if (gh) {
    writeJson(CACHE, { user: gh, source: 'gh', at: new Date().toISOString() });
    return { user: gh, source: 'gh' };
  }
  const git = fromGit(cwd);
  if (git) return { user: git, source: 'git' };
  return { user: process.env.USER || process.env.USERNAME || 'unknown', source: 'os' };
}
