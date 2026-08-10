import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDir, exists, isDir, readJson, readTextOr, rmrf, writeJson, writeText } from './core/fsx.js';
import { setBlock } from './core/md.js';
import { AGENT_BLOCK, MCP_SERVER } from './templates/instructions.js';

/**
 * The user's config home, resolved per call rather than at module load: a
 * global install writes into it, and a caller (a test, a sandbox) that changes
 * HOME must not be silently ignored because this was captured on import.
 */
function home(): string {
  return os.homedir();
}

export const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export interface Target {
  id: string;
  label: string;
  /** true when this agent looks installed / used here */
  detect(project: string): boolean;
  install(project: string, opts: InstallOpts): string[];
}

export interface InstallOpts {
  mcp: boolean;
  dryRun: boolean;
  global: boolean;
  /** register the SessionStart / Stop hooks (Claude Code only). Default on. */
  hooks?: boolean;
}

function writeBlock(file: string, block: string, dry: boolean): string {
  const src = readTextOr(file);
  const next = setBlock(src, 'instructions', block);
  if (next !== src && !dry) writeText(file, next);
  return `${next === src ? 'up-to-date' : 'wrote'} ${file}`;
}

function copyTree(from: string, to: string, dry: boolean): string {
  if (!isDir(from)) return `skip (missing in package): ${from}`;
  if (!dry) {
    ensureDir(to);
    fs.cpSync(from, to, { recursive: true });
  }
  return `copied ${path.relative(PKG_ROOT, from)} → ${to}`;
}

function mergeMcpJson(file: string, key: string, dry: boolean): string {
  const cfg = readJson<Record<string, any>>(file, {});
  cfg[key] = cfg[key] ?? {};
  const before = JSON.stringify(cfg[key].dolly ?? null);
  cfg[key].dolly = { ...MCP_SERVER };
  if (before === JSON.stringify(cfg[key].dolly)) return `up-to-date ${file}`;
  if (!dry) writeJson(file, cfg);
  return `wrote ${file} (${key}.dolly)`;
}

function tomlBlock(file: string, dry: boolean): string {
  const src = readTextOr(file);
  const marker = '# dolly:start';
  const endMarker = '# dolly:end';
  const block = [
    marker,
    '[mcp_servers.dolly]',
    'command = "dolly"',
    'args = ["mcp"]',
    endMarker,
  ].join('\n');
  let next: string;
  const i = src.indexOf(marker);
  const j = src.indexOf(endMarker);
  if (i !== -1 && j > i) next = src.slice(0, i) + block + src.slice(j + endMarker.length);
  else next = `${src}${src && !src.endsWith('\n') ? '\n' : ''}${src ? '\n' : ''}${block}\n`;
  if (next !== src && !dry) writeText(file, next);
  return `${next === src ? 'up-to-date' : 'wrote'} ${file}`;
}

/**
 * Register the SessionStart / Stop hooks in settings.json. These are what make
 * dolly automatic: context injected on every new session, and a step logged for
 * every finished turn. Matched by command string so re-running never duplicates.
 */
function mergeHooks(file: string, dry: boolean): string {
  const cfg = readJson<Record<string, any>>(file, {});
  cfg.hooks = cfg.hooks ?? {};
  const wanted: Record<string, string> = {
    SessionStart: 'dolly hook session-start',
    Stop: 'dolly hook stop',
  };
  let changed = false;
  for (const [event, command] of Object.entries(wanted)) {
    const groups: any[] = Array.isArray(cfg.hooks[event]) ? cfg.hooks[event] : [];
    const already = groups.some((g) =>
      (g?.hooks ?? []).some((h: any) => typeof h?.command === 'string' && h.command.includes(command)),
    );
    if (already) continue;
    groups.push({ hooks: [{ type: 'command', command, timeout: 15 }] });
    cfg.hooks[event] = groups;
    changed = true;
  }
  if (!changed) return `up-to-date ${file} (hooks)`;
  if (!dry) writeJson(file, cfg);
  return `wrote ${file} (hooks: SessionStart, Stop)`;
}

/**
 * Remove the footprint of the pre-rename name.
 *
 * Without this an upgrade leaves a working install *and* a dead one: two skill
 * directories, two command sets, two MCP servers, two hook entries, and a
 * stale instruction block that `setBlock` cannot update because its marker no
 * longer matches. Idempotent — a no-op once there is nothing old left.
 */
function cleanLegacy(project: string, base: string, dry: boolean): string[] {
  const out: string[] = [];
  const OLD = 'dollie';

  for (const rel of [
    path.join(base, 'skills', OLD),
    path.join(base, 'skills', `${OLD}-planning`),
    path.join(base, 'commands', OLD),
  ]) {
    if (!isDir(rel)) continue;
    if (!dry) rmrf(rel);
    out.push(`removed ${rel}`);
  }

  // stale instruction blocks: rename the marker so the block is updated in
  // place instead of a second one being appended below it
  for (const file of [
    path.join(project, 'CLAUDE.md'),
    path.join(home(), '.claude', 'CLAUDE.md'),
    path.join(project, 'AGENTS.md'),
    path.join(project, 'GEMINI.md'),
    path.join(project, '.github', 'copilot-instructions.md'),
  ]) {
    const src = readTextOr(file);
    if (!src.includes(`<!-- ${OLD}:instructions -->`)) continue;
    if (!dry) writeText(file, src.replace(new RegExp(`<!--(\\s*/?\\s*)${OLD}:`, 'g'), '<!--$1dolly:'));
    out.push(`renamed stale instruction block in ${file}`);
  }

  for (const [file, key] of [
    [path.join(project, '.mcp.json'), 'mcpServers'],
    [path.join(project, '.cursor', 'mcp.json'), 'mcpServers'],
    [path.join(project, '.gemini', 'settings.json'), 'mcpServers'],
    [path.join(home(), '.claude.json'), 'mcpServers'],
  ] as const) {
    const cfg = readJson<Record<string, any>>(file, {});
    if (!cfg[key]?.[OLD]) continue;
    delete cfg[key][OLD];
    if (!dry) writeJson(file, cfg);
    out.push(`removed ${key}.${OLD} from ${file}`);
  }

  const settings = path.join(base, 'settings.json');
  const cfg = readJson<Record<string, any>>(settings, {});
  let touched = false;
  for (const event of Object.keys(cfg.hooks ?? {})) {
    const groups: any[] = cfg.hooks[event] ?? [];
    const kept = groups.filter(
      (g) => !(g?.hooks ?? []).some((h: any) => typeof h?.command === 'string' && /\bdollie\b/.test(h.command)),
    );
    if (kept.length !== groups.length) {
      cfg.hooks[event] = kept;
      touched = true;
    }
  }
  if (touched) {
    if (!dry) writeJson(settings, cfg);
    out.push(`removed ${OLD} hooks from ${settings}`);
  }
  return out;
}


export const TARGETS: Target[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    detect: (p) => isDir(path.join(home(), '.claude')) || isDir(path.join(p, '.claude')),
    install(project, opts) {
      const base = opts.global ? path.join(home(), '.claude') : path.join(project, '.claude');
      const out: string[] = cleanLegacy(project, base, opts.dryRun);
      out.push(copyTree(path.join(PKG_ROOT, 'skills', 'dolly'), path.join(base, 'skills', 'dolly'), opts.dryRun));
      out.push(
        copyTree(
          path.join(PKG_ROOT, 'skills', 'dolly-planning'),
          path.join(base, 'skills', 'dolly-planning'),
          opts.dryRun,
        ),
      );
      out.push(copyTree(path.join(PKG_ROOT, 'commands'), path.join(base, 'commands', 'dolly'), opts.dryRun));
      out.push(
        writeBlock(
          opts.global ? path.join(home(), '.claude', 'CLAUDE.md') : path.join(project, 'CLAUDE.md'),
          AGENT_BLOCK,
          opts.dryRun,
        ),
      );
      if (opts.mcp) {
        out.push(
          mergeMcpJson(
            opts.global ? path.join(home(), '.claude.json') : path.join(project, '.mcp.json'),
            'mcpServers',
            opts.dryRun,
          ),
        );
      }
      if (opts.hooks !== false) {
        out.push(mergeHooks(path.join(base, 'settings.json'), opts.dryRun));
      }
      return out;
    },
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    detect: () => isDir(path.join(home(), '.codex')),
    install(project, opts) {
      const out = [writeBlock(path.join(project, 'AGENTS.md'), AGENT_BLOCK, opts.dryRun)];
      if (opts.mcp) out.push(tomlBlock(path.join(home(), '.codex', 'config.toml'), opts.dryRun));
      return out;
    },
  },
  {
    id: 'cursor',
    label: 'Cursor',
    detect: (p) => isDir(path.join(home(), '.cursor')) || isDir(path.join(p, '.cursor')),
    install(project, opts) {
      const rule = [
        '---',
        'description: dolly task memory and planning',
        'alwaysApply: true',
        '---',
        '',
        AGENT_BLOCK,
        '',
      ].join('\n');
      const file = path.join(project, '.cursor', 'rules', 'dolly.mdc');
      if (!opts.dryRun) writeText(file, rule);
      const out = [`wrote ${file}`];
      if (opts.mcp) out.push(mergeMcpJson(path.join(project, '.cursor', 'mcp.json'), 'mcpServers', opts.dryRun));
      return out;
    },
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    detect: (p) => isDir(path.join(home(), '.codeium')) || isDir(path.join(p, '.windsurf')),
    install(project, opts) {
      const file = path.join(project, '.windsurf', 'rules', 'dolly.md');
      if (!opts.dryRun) writeText(file, `${AGENT_BLOCK}\n`);
      return [`wrote ${file}`];
    },
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot',
    detect: (p) => isDir(path.join(p, '.github')),
    install(project, opts) {
      return [
        writeBlock(path.join(project, '.github', 'copilot-instructions.md'), AGENT_BLOCK, opts.dryRun),
      ];
    },
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    detect: () => isDir(path.join(home(), '.gemini')),
    install(project, opts) {
      const out = [writeBlock(path.join(project, 'GEMINI.md'), AGENT_BLOCK, opts.dryRun)];
      if (opts.mcp) out.push(mergeMcpJson(path.join(project, '.gemini', 'settings.json'), 'mcpServers', opts.dryRun));
      return out;
    },
  },
  {
    id: 'opencode',
    label: 'opencode',
    detect: () =>
      isDir(path.join(home(), '.config', 'opencode')) || isDir(path.join(home(), '.opencode')),
    install(project, opts) {
      const out = [writeBlock(path.join(project, 'AGENTS.md'), AGENT_BLOCK, opts.dryRun)];
      if (opts.mcp) {
        const file = path.join(project, 'opencode.json');
        const cfg = readJson<Record<string, any>>(file, { $schema: 'https://opencode.ai/config.json' });
        cfg.mcp = cfg.mcp ?? {};
        cfg.mcp.dolly = { type: 'local', command: ['dolly', 'mcp'], enabled: true };
        if (!opts.dryRun) writeJson(file, cfg);
        out.push(`wrote ${file} (mcp.dolly)`);
      }
      return out;
    },
  },
  {
    id: 'agents',
    label: 'AGENTS.md (generic)',
    detect: (p) => exists(path.join(p, 'AGENTS.md')),
    install(project, opts) {
      return [writeBlock(path.join(project, 'AGENTS.md'), AGENT_BLOCK, opts.dryRun)];
    },
  },
];

export function detectTargets(project: string): Target[] {
  return TARGETS.filter((t) => t.detect(project));
}

export function installTargets(
  project: string,
  ids: string[],
  opts: InstallOpts,
): { target: Target; log: string[] }[] {
  const chosen = ids.length
    ? TARGETS.filter((t) => ids.includes(t.id))
    : detectTargets(project);
  const unknown = ids.filter((id) => !TARGETS.some((t) => t.id === id));
  if (unknown.length) {
    throw new Error(
      `unknown agent(s): ${unknown.join(', ')} — known: ${TARGETS.map((t) => t.id).join(', ')}`,
    );
  }
  return chosen.map((t) => ({ target: t, log: t.install(project, opts) }));
}

export { AGENT_BLOCK };
