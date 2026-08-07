#!/usr/bin/env node
/**
 * Hook shim. Resolves the dolly CLI in this order:
 *   1. dist/cli.js next to the plugin (repo checkout / npm package)
 *   2. `dolly` on PATH (global npm install)
 * Always exits 0 — a missing CLI must never break the agent's session.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const local = path.join(here, '..', 'dist', 'cli.js');
const args = process.argv.slice(2);

try {
  if (existsSync(local)) {
    spawnSync(process.execPath, [local, ...args], { stdio: 'inherit' });
  } else {
    spawnSync('dolly', args, { stdio: 'inherit', shell: process.platform === 'win32' });
  }
} catch {
  /* silent — hooks must not break sessions */
}
process.exit(0);
