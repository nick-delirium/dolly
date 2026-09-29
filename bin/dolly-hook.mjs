#!/usr/bin/env node
/**
 * Hook shim. Resolves the dolly CLI in this order:
 *   1. dist/cli.js next to the plugin (repo checkout / npm package)
 *   2. `dolly` on PATH (global npm install)
 * Always exits 0 — a missing CLI must never break the agent's session.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const local = path.join(here, '..', 'dist', 'cli.js');
const args = process.argv.slice(2);

/**
 * `dolly init` also writes these hooks into settings.json. With both in place
 * every session got its context injected twice and two Stop hooks raced for
 * one turn — so the plugin defers to hooks registered in settings.
 */
function registeredInSettings(sub) {
  const project = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const files = [
    path.join(project, '.claude', 'settings.json'),
    path.join(project, '.claude', 'settings.local.json'),
    path.join(os.homedir(), '.claude', 'settings.json'),
  ];
  return files.some((f) => {
    try {
      return readFileSync(f, 'utf8').includes(`dolly hook ${sub}`);
    } catch {
      return false;
    }
  });
}

try {
  if (args[0] === 'hook' && registeredInSettings(args[1])) process.exit(0);
  if (existsSync(local)) {
    spawnSync(process.execPath, [local, ...args], { stdio: 'inherit' });
  } else {
    spawnSync('dolly', args, { stdio: 'inherit', shell: process.platform === 'win32' });
  }
} catch {
  /* silent — hooks must not break sessions */
}
process.exit(0);
