/**
 * The setup screen behind `dolly init` and `dolly setup`.
 *
 * Everything it asks was already a setting; the wizard's only job is to stop
 * those settings from being discoverable exclusively by reading source. Two
 * rules keep it honest:
 *
 *  - every prompt opens on what dolly does today, so pressing enter through the
 *    whole screen is exactly the old non-interactive `dolly init`;
 *  - nothing is written unless an answer actually changed it, so re-running the
 *    wizard and accepting everything leaves the store byte-identical.
 *
 * It never runs without a human: the caller checks `core/tty.ts` first, because
 * a prompt written to a JSON-RPC stream or a CI log is a hang, not a question.
 */
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { color } from './core/render.js';
import { repoRoot } from './core/git.js';
import { ensureProject, projectFile, projectStatus } from './core/project.js';
import {
  STORE_DIRNAME,
  Store,
  globalStoreFor,
  locateStore,
  moveStore,
  recordProject,
} from './core/store.js';
import { type Config } from './core/types.js';
import { TARGETS, installTargets } from './install.js';
import { confirm, heading, multiselect, note, select, text, type Term } from './prompt.js';

/** agents whose instructions can also register the MCP server */
const MCP_CAPABLE = new Set(['claude', 'codex', 'cursor', 'gemini', 'opencode']);

export interface WizardPre {
  /** where task memory lives — `--store local|global` */
  store?: 'local' | 'global';
  /** `--agents a,b` and bare positionals */
  agents?: string[];
  /** `--local|--global`: where agent instructions are written */
  scope?: 'local' | 'global';
  mcp?: boolean;
  hooks?: boolean;
}

export interface WizardOpts {
  term: Term;
  pre?: WizardPre;
  cwd?: string;
  /** ask everything, write nothing */
  dryRun?: boolean;
}

export interface WizardResult {
  storeRoot: string;
  storeChoice: 'local' | 'global';
  moved: { from: string; to: string } | null;
  agents: string[];
  wrote: string[];
}

export async function runWizard(opts: WizardOpts): Promise<WizardResult> {
  const { term, pre = {}, dryRun = false } = opts;
  const cwd = opts.cwd ?? process.cwd();
  const loc = locateStore(cwd);
  const store = new Store(loc);
  const project = loc.project;
  const cfg = store.config;
  const isRepo = Boolean(repoRoot(project));

  term.write(`\n${color.bold('dolly setup')} ${color.dim(`· ${project}`)}\n`);
  if (store.exists) note(term, `reconfiguring the store at ${store.root} — enter keeps what it is`);

  /* ---------------------------- task memory ----------------------------- */

  const localRoot = path.join(project, STORE_DIRNAME);
  const globalRoot = globalStoreFor(project);
  const currentChoice: 'local' | 'global' =
    loc.kind === 'linked' || loc.kind === 'global' ? 'global' : 'local';

  let storeChoice: 'local' | 'global';
  if (loc.kind === 'env') {
    storeChoice = currentChoice;
    note(term, `store pinned by DOLLY_DIR (${store.root}) — leaving it where it is`);
  } else {
    heading(term, 'Task memory');
    storeChoice = await select<'local' | 'global'>(term, {
      question: 'Where should this project’s task memory live?',
      index: (pre.store ?? currentChoice) === 'global' ? 1 : 0,
      choices: [
        {
          value: 'local',
          label: isRepo ? 'this repo' : 'this directory',
          hint: isRepo ? '.dolly/ — commit it, teammates share it' : '.dolly/ — right here',
        },
        {
          value: 'global',
          label: 'private to you',
          hint: `${tildify(globalRoot)} — nothing added to the repo`,
        },
      ],
    });
  }
  const targetRoot = loc.kind === 'env' ? store.root : storeChoice === 'local' ? localRoot : globalRoot;

  /* ------------------------------- agents ------------------------------- */

  heading(term, 'Agents');
  const detected = TARGETS.filter((t) => t.detect(project)).map((t) => t.id);
  const agents = await multiselect<string>(term, {
    question: 'Which agents should dolly wire up here?',
    checked: pre.agents?.length ? pre.agents : detected,
    choices: TARGETS.map((t) => ({
      value: t.id,
      label: t.label,
      hint: detected.includes(t.id) ? 'detected' : undefined,
    })),
  });

  let scope: 'local' | 'global' = pre.scope ?? cfg.install.scope;
  let mcp = pre.mcp ?? cfg.install.mcp;
  let hooks = pre.hooks ?? true;
  if (agents.length) {
    scope = await select<'local' | 'global'>(term, {
      question: 'Where should the agent instructions be written?',
      index: scope === 'global' ? 1 : 0,
      choices: [
        { value: 'local', label: 'this project', hint: 'CLAUDE.md, .claude/, .cursor/ — shared with the repo' },
        { value: 'global', label: 'your user config', hint: '~/.claude/ — every project you open' },
      ],
    });
    if (agents.some((a) => MCP_CAPABLE.has(a))) {
      mcp = await confirm(term, { question: 'Register the dolly MCP server?', value: mcp });
    }
    if (agents.includes('claude')) {
      hooks = await confirm(term, {
        question: 'Install the Claude Code hooks? (context on session start, a step per finished turn)',
        value: hooks,
      });
    }
  } else {
    note(term, 'no agents selected — instructions and MCP skipped');
  }

  /* ------------------------------ behaviour ----------------------------- */

  heading(term, 'Behaviour');
  const handle = await text(term, {
    question: 'Handle to stamp on every step',
    value: store.user,
    validate: (s) => (s.trim() ? null : 'a handle cannot be empty'),
  });
  const autoLog = await confirm(term, {
    question: 'Auto-log a step for every finished turn the agent did not log itself?',
    value: cfg.reindex.autoLog,
  });

  /* -------------------------------- apply ------------------------------- */

  const wrote: string[] = [];
  let moved: { from: string; to: string } | null = null;

  if (store.exists && path.resolve(store.root) !== path.resolve(targetRoot)) {
    term.write('\n');
    const ok = await confirm(term, {
      question: `Move the existing store?\n  ${store.root}\n  → ${targetRoot}`,
      value: true,
    });
    if (ok) {
      if (!dryRun) moveStore(store.root, targetRoot);
      moved = { from: store.root, to: targetRoot };
      wrote.push(`moved ${store.root} → ${targetRoot}`);
    }
  }

  const finalRoot = moved || !store.exists ? targetRoot : store.root;
  const finalChoice: 'local' | 'global' =
    path.resolve(finalRoot) === path.resolve(localRoot) ? 'local' : 'global';

  // Both answers are recorded, so "in the repo on purpose" is a fact rather than
  // the absence of one. A store pinned by DOLLY_DIR was not chosen here and is
  // left out: recording it would outlive the environment variable and keep
  // resolving there once it is gone.
  if (!dryRun && loc.kind !== 'env') {
    recordProject(project, { store: finalRoot, local: finalChoice === 'local' });
  }

  const next = new Store({
    root: finalRoot,
    kind: loc.kind === 'env' ? 'env' : finalChoice === 'global' ? 'linked' : 'repo',
    project,
  });
  if (!next.exists) {
    if (!dryRun) next.init();
    wrote.push(`created ${finalRoot}`);
  } else if (!dryRun) {
    next.init();
  }

  const desired: Config = {
    ...cfg,
    install: { scope, mcp },
    reindex: { ...cfg.reindex, autoLog },
  };
  if (changed(cfg, desired)) {
    if (!dryRun) next.saveConfig(desired);
    wrote.push(`wrote ${next.configPath}`);
  }
  // Only pin the handle when it differs from what dolly already resolves to —
  // writing it otherwise turns an auto-detected identity into a frozen one.
  if (handle.trim() && handle.trim() !== store.user) {
    if (!dryRun) next.saveLocal({ user: handle.trim() });
    wrote.push(`wrote ${next.localConfigPath} (user)`);
  }

  if (agents.length) {
    const results = installTargets(project, agents, {
      global: scope === 'global',
      mcp,
      hooks,
      dryRun,
    });
    for (const r of results) for (const line of r.log) wrote.push(`${r.target.label}: ${line}`);
  }

  /* ------------------------------- extras ------------------------------- */

  term.write('\n');
  if (!projectStatus(next).exists) {
    const ok = await confirm(term, {
      question: 'Create the project brief? (what is true about this repo — your agent fills it in)',
      value: true,
    });
    if (ok) {
      if (!dryRun) ensureProject(next);
      wrote.push(`created ${projectFile(next)}`);
    }
  }
  if (finalChoice === 'local' && isRepo) {
    const ok = await confirm(term, { question: `Stage ${STORE_DIRNAME}/ for commit?`, value: true });
    if (ok && !dryRun) {
      const res = spawnSync('git', ['add', finalRoot], { cwd: project, stdio: 'ignore' });
      wrote.push(res.status === 0 ? `staged ${finalRoot}` : `could not stage ${finalRoot}`);
    }
  }

  // Moving a store out of a repo that had already committed it leaves git
  // tracking files that no longer exist. Saying "nothing to commit" there is
  // wrong — the deletion is the thing to commit, and until it is, a teammate's
  // pull puts the store back and dolly starts reporting a conflict.
  const stillTracked =
    finalChoice === 'global' && isRepo && moved
      ? spawnSync('git', ['ls-files', '--', STORE_DIRNAME], { cwd: project, encoding: 'utf8' })
      : null;
  const trackedAfterMove = Boolean(stillTracked?.status === 0 && stillTracked.stdout.trim());

  /* ------------------------------ summary ------------------------------- */

  term.write(`\n${color.bold('Done.')}\n`);
  term.write(`  store        ${finalRoot} ${color.dim(`(${finalChoice})`)}\n`);
  term.write(`  handle       @${handle}\n`);
  term.write(`  agents       ${agents.length ? agents.join(', ') : color.dim('none')}\n`);
  if (agents.length) {
    term.write(`  instructions ${scope}${mcp ? ' · mcp' : ''}${hooks && agents.includes('claude') ? ' · hooks' : ''}\n`);
  }
  if (wrote.length) {
    term.write(`\n${color.dim('changes')}\n`);
    for (const line of wrote) term.write(`  ${line}\n`);
  }
  if (dryRun) term.write(`\n${color.dim('dry run — nothing written')}\n`);

  term.write(`\n${color.bold('Next')}\n`);
  term.write(`  dolly plan start "<feature>"   ${color.dim('interview, then a spec')}\n`);
  term.write(`  dolly new "<title>"            ${color.dim('small task, straight to work')}\n`);
  term.write(`  dolly board                    ${color.dim('what exists')}\n`);
  if (finalChoice === 'local') {
    term.write(`\n${color.dim(`commit ${STORE_DIRNAME}/ so teammates share the same task memory`)}\n`);
  } else if (trackedAfterMove) {
    term.write(
      `\n${color.yellow(`${STORE_DIRNAME}/ is still tracked by git.`)} ` +
        `${color.dim(`Commit its removal (\`git rm -r --cached ${STORE_DIRNAME}\`), or the next pull brings it back.`)}\n`,
    );
  } else {
    term.write(
      `\n${color.dim('this store is yours alone — teammates get their own, and nothing is committed')}\n`,
    );
  }

  return { storeRoot: finalRoot, storeChoice: finalChoice, moved, agents, wrote };
}

/* -------------------------------- helpers --------------------------------- */

/** `~/.dolly/projects/x` reads as a location; the absolute path just gets clipped */
function tildify(p: string): string {
  const h = os.homedir();
  return h && p.startsWith(h) ? `~${p.slice(h.length)}` : p;
}

/** did any answer actually change the config? `user` is per-person, never here */
function changed(before: Config, after: Config): boolean {
  const strip = (c: Config) => {
    const { user: _user, ...rest } = c;
    return JSON.stringify(rest);
  };
  return strip(before) !== strip(after);
}

/**
 * What a caller with no terminal is told. It names the way out rather than the
 * problem: every wizard answer has a flag, and `--yes` takes the defaults.
 */
export function nonTtyHint(cmd: string, reason: string): string {
  return (
    `\`dolly ${cmd}\` opens a setup screen and ${reason}. ` +
    'Pass --yes to take the defaults, or set it explicitly: ' +
    `--store local|global --agents ${TARGETS.slice(0, 2).map((t) => t.id).join(',')} ` +
    '--local|--global --no-mcp --no-hooks --no-agents.'
  );
}
