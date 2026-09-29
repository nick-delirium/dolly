import fs from 'node:fs';
import os from 'node:os';

/**
 * Where dolly keeps its own state — identity cache, out-of-repo stores, the
 * project index. `DOLLY_HOME` exists so a test can isolate all of that instead
 * of writing into the developer's real home directory.
 */
let homeCache: { raw: string; resolved: string } | null = null;

export function dollyHome(): string {
  const raw = process.env.DOLLY_HOME?.trim() || os.homedir();
  // Canonicalised, because this string ends up *inside* paths dolly stores and
  // compares — a home given as a symlink or an unnormalised path would produce a
  // different store path for the same physical directory, and break the `~`
  // shortening that keeps `dolly projects` readable. Memoised on the raw value:
  // this is on the hot path (once per ancestor directory per lookup), and the
  // environment can still change within a process.
  if (homeCache?.raw === raw) return homeCache.resolved;
  let resolved = raw;
  try {
    resolved = fs.realpathSync(raw);
  } catch {
    /* not created yet — the unresolved path is the best answer available */
  }
  homeCache = { raw, resolved };
  return resolved;
}
