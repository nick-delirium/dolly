/**
 * The one place dolly learns its own version.
 *
 * It used to be hardcoded in four files — cli.ts, mcp.ts, package.json and
 * .claude-plugin/plugin.json — which drifts the moment a release is cut. Reading
 * package.json at runtime keeps a single source of truth with no build step:
 * npm always ships package.json, whatever the `files` whitelist says.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** the installed package root, two levels up from dist/core/ */
export const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * What npm calls dolly. Not `dolly`: that name belongs to an unrelated package,
 * so asking the registry about it reports someone else's releases.
 */
const DEFAULT_NAME = '@dlrm/dolly';

function read(): { name: string; version: string; repository: string | null } {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8'));
    const url: unknown = pkg.repository?.url ?? pkg.repository;
    return {
      name: typeof pkg.name === 'string' ? pkg.name : DEFAULT_NAME,
      version: typeof pkg.version === 'string' ? pkg.version : '0.0.0',
      repository: typeof url === 'string' ? url : null,
    };
  } catch {
    return { name: DEFAULT_NAME, version: '0.0.0', repository: null };
  }
}

const PKG = read();

export const VERSION = PKG.version;

/** the npm package name; the command it installs is `dolly` either way */
export const PKG_NAME = PKG.name;

/** `owner/name` parsed out of the repository field, for the GitHub API */
export function repoSlug(): string | null {
  if (!PKG.repository) return null;
  const m = /github\.com[:/]([^/]+\/[^/.]+)/.exec(PKG.repository);
  return m ? m[1] : null;
}
