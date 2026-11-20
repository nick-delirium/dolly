/**
 * "An update is available" — convenience only, and deliberately timid.
 *
 * The dangerous case is already handled elsewhere: a stale binary writing a
 * newer shared store is refused outright by the schema-version guard. So this
 * exists purely to tell a human they are behind, and every design choice below
 * follows from three constraints:
 *
 *  - dolly runs on every SessionStart, every Stop and every MCP tool call, so a
 *    network request must never happen in-band. The check reads a cache; a stale
 *    cache is refreshed by a detached process whose result is used next time.
 *  - stdout is a protocol (`dolly mcp` speaks JSON-RPC, `--json` is parsed), so
 *    the notice only ever goes to stderr, and never during mcp/hook commands.
 *  - agents act on text they see. Told an update is available, an agent may stop
 *    mid-task to install it, or repeat it in a step summary as project state. The
 *    notice is for a human at a terminal, so that is the only place it appears.
 *
 * The store's Invariants say dolly never *needs* a network. This check degrades
 * silently when offline and can be switched off, so that still holds.
 */
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { exists, readJson, writeJson } from './fsx.js';
import { dollyHome } from './home.js';
import { PKG_NAME, PKG_ROOT, VERSION } from './pkg.js';
import { notAHuman, type Env } from './tty.js';

export interface UpdateCache {
  checkedAt: string;
  /** newest published version, or null when the last check could not tell */
  latest: string | null;
  source: 'git' | 'npm' | 'none';
}

/** resolved per call, so DOLLY_HOME isolates it */
const cacheFile = () => path.join(dollyHome(), '.dolly', 'update.json');
const DEFAULT_TTL_HOURS = 24;

/* ------------------------------- semver ---------------------------------- */

function split(v: string): { core: number[]; pre: string[] } {
  const [core, ...rest] = v.replace(/^v/, '').split('+')[0].split('-');
  const pre = rest.join('-');
  return {
    core: core.split('.').map((n) => Number(n) || 0),
    pre: pre ? pre.split('.') : [],
  };
}

/**
 * -1 / 0 / 1 in semver order: 1.1.0-next.0 < 1.1.0-next.1 < 1.1.0. Prereleases
 * must order among themselves, or a `next` install would never hear about the
 * snapshot after its own.
 */
export function cmpSemver(a: string, b: string): number {
  const x = split(a);
  const y = split(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.core[i] ?? 0) - (y.core[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  // a release outranks any prerelease of itself
  if (!x.pre.length || !y.pre.length) return Math.sign(y.pre.length - x.pre.length);
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn && Number(p) !== Number(q)) return Number(p) > Number(q) ? 1 : -1;
    if (pn !== qn) return pn ? -1 : 1;
    if (p !== q) return p > q ? 1 : -1;
  }
  return 0;
}

/**
 * The npm dist-tag a registry install follows: a prerelease (1.1.0-next.2) came
 * from `next`, anything else from `latest`. Read off the version itself, because
 * npm records nowhere which tag a global package was installed from.
 */
export function channelOf(version: string): 'latest' | 'next' {
  return split(version).pre.length ? 'next' : 'latest';
}

export function isNewer(latest: string | null, current: string): boolean {
  if (!latest) return false;
  return cmpSemver(latest, current) > 0;
}

/* ----------------------------- suppression -------------------------------- */

/** commands whose stdout/stderr is machine-read or agent-facing */
const QUIET_COMMANDS = new Set(['mcp', 'hook', 'statusline', '__update-check']);

export type { Env };

/**
 * Why the notice must stay silent, or null when it may be shown.
 * Returning the reason rather than a boolean keeps it testable.
 *
 * The agent / CI / no-terminal half lives in core/tty.ts, shared with the setup
 * wizard: the two must never disagree about whether a human is watching. Only
 * the update-specific opt-outs are decided here. Note the terminal test stays
 * stdout-only — an update notice is readable through a pipe-less stdin, and
 * `updateNotice` is called on every command.
 */
export function suppressed(
  cmd: string,
  opts: { env?: Env; isTty?: boolean; enabled?: boolean } = {},
): string | null {
  const env = opts.env ?? process.env;
  if (opts.enabled === false) return 'disabled by config';
  if (env.DOLLY_NO_UPDATE_CHECK) return 'DOLLY_NO_UPDATE_CHECK';
  if (env.NO_UPDATE_NOTIFIER) return 'NO_UPDATE_NOTIFIER';
  if (QUIET_COMMANDS.has(cmd)) return `${cmd} output is machine-read`;
  return notAHuman({ env, isTty: opts.isTty ?? Boolean(process.stdout.isTTY) });
}

/** `updateCheck: false` in a store's local.json, or in ~/.dolly/local.json */
export function checkEnabled(storeRoot?: string): boolean {
  for (const root of [storeRoot, path.join(dollyHome(), '.dolly')]) {
    if (!root) continue;
    const local = readJson<{ updateCheck?: boolean }>(path.join(root, 'local.json'), {});
    if (typeof local.updateCheck === 'boolean') return local.updateCheck;
  }
  return true;
}

/* -------------------------------- cache ----------------------------------- */

export function readCache(file = cacheFile()): UpdateCache | null {
  const c = readJson<UpdateCache | null>(file, null);
  return c && typeof c.checkedAt === 'string' ? c : null;
}

export function cacheStale(
  cache: UpdateCache | null,
  ttlHours = DEFAULT_TTL_HOURS,
  now = Date.now(),
): boolean {
  if (!cache) return true;
  const at = Date.parse(cache.checkedAt);
  if (!Number.isFinite(at)) return true;
  return now - at > ttlHours * 3600_000;
}

/* ------------------------------ how to upgrade ---------------------------- */

/**
 * - `clone`: a git checkout (direct, or `npm link`ed — the path resolves through
 *   the symlink to the checkout, which has .git)
 * - `package`: installed from the npm registry; `channelOf(version)` says which
 *   dist-tag it follows
 */
export type InstallKind = 'clone' | 'package';

export function installKind(root = PKG_ROOT): InstallKind {
  return exists(path.join(root, '.git')) ? 'clone' : 'package';
}

/* ------------------------------ the lookup -------------------------------- */

/** newest tag on the remote, read without mutating the local repo */
function latestFromGit(root: string): string | null {
  try {
    const out = execFileSync('git', ['ls-remote', '--tags', '--refs', 'origin'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 8000,
    });
    const versions = [...out.matchAll(/refs\/tags\/(v?\d+\.\d+\.\d+)\s*$/gm)].map((m) => m[1]);
    if (!versions.length) return null;
    return versions.sort(cmpSemver)[versions.length - 1].replace(/^v/, '');
  } catch {
    return null;
  }
}

/**
 * The newest version available to THIS installation, looked up the same way
 * `runUpdateCheck` does: a checkout compares against the remote's tags, a
 * package against the registry (falling back to tags while dolly is unpublished).
 *
 * `dolly update --check` asks for this in-band. Reaching for the git path alone
 * would report "could not reach the remote" to every npm-installed user — the
 * exact people the passive notice sends here, since PKG_ROOT has no .git.
 */
export async function latestForCheck(
  kind: InstallKind = installKind(),
  root = PKG_ROOT,
  current = VERSION,
): Promise<{ latest: string | null; source: UpdateCache['source'] }> {
  if (kind === 'clone') {
    const latest = latestFromGit(root);
    return { latest, source: latest ? 'git' : 'none' };
  }
  // the tag this copy follows: a `next` install is compared with `next`
  const fromNpm = await latestFromNpm(PKG_NAME, channelOf(current));
  if (fromNpm) return { latest: fromNpm, source: 'npm' };
  const latest = latestFromGit(root);
  return { latest, source: latest ? 'git' : 'none' };
}

async function latestFromNpm(name: string, tag: string): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${name}/${tag}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: string };
    return typeof body.version === 'string' ? body.version : null;
  } catch {
    return null;
  }
}

/**
 * Do the actual lookup and write the cache. Runs in a detached child, so it may
 * take as long as it likes and must never throw into the parent.
 */
export async function runUpdateCheck(file = cacheFile()): Promise<void> {
  // not published yet? latestForCheck falls back to the tags of the repo it
  // came from, so a package install still learns about a new release
  const { latest, source } = await latestForCheck();
  // a failed lookup is still cached, so a machine offline for a week does not
  // retry on every single command
  writeJson(file, { checkedAt: new Date().toISOString(), latest, source } satisfies UpdateCache);
}

/** kick off the refresh and forget about it */
function refreshDetached(): void {
  try {
    const child = spawn(process.execPath, [path.join(PKG_ROOT, 'dist', 'cli.js'), '__update-check'], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  } catch {
    /* a failed refresh is never worth surfacing */
  }
}

/**
 * The notice to print, or null. Refreshes a stale cache in the background and
 * uses the previous answer, so nothing is ever waited on.
 */
export function updateNotice(
  cmd: string,
  current: string,
  opts: { storeRoot?: string; file?: string; ttlHours?: number; env?: Env; isTty?: boolean } = {},
): string | null {
  const why = suppressed(cmd, {
    enabled: checkEnabled(opts.storeRoot),
    env: opts.env,
    isTty: opts.isTty,
  });
  if (why) return null;

  const file = opts.file ?? cacheFile();
  const cache = readCache(file);
  if (cacheStale(cache, opts.ttlHours ?? DEFAULT_TTL_HOURS)) refreshDetached();
  if (!cache || !isNewer(cache.latest, current)) return null;

  return (
    `dolly ${cache.latest} is available (you have ${current})\n` +
    `  run: dolly update\n` +
    `  silence this: dolly config set updateCheck false`
  );
}
