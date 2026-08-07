/**
 * Store-format migration. `dolly reindex` re-derives a task from a
 * conversation; this re-renders tasks that were written by an older dolly so
 * the on-disk layout matches the current one.
 *
 * v1 (0.1.x): context/spec.md + context/spec.vN.md appendices,
 *             context/steps/NNNN.md per step
 * v2 (0.2.x): context/spec.md holding current spec + superseded versions,
 *             context/steps.md holding every step entry
 */
import path from 'node:path';
import { exists, isDir, listFiles, move, readJson, readTextOr, rmrf, writeJson, writeText } from './core/fsx.js';
import { appendBlock } from './core/md.js';
import { LEGACY_STORE_DIRNAME, LOCAL_CONFIG, STORE_DIRNAME, Store, sharedUserLeak } from './core/store.js';
import { contextDir, readSpecDoc, saveTask, specFile, stepsFile } from './core/task.js';
import type { Task } from './core/types.js';

export interface MigrateAction {
  kind: 'steps' | 'spec' | 'store-rename' | 'markers' | 'config-split';
  task: string;
  detail: string;
}

/**
 * Rewrite the block markers the project was renamed out of.
 *
 * These are *parsed*, not decorative: `getBlock`, `listBlocks` and `removeBlock`
 * all match the literal prefix. Renaming the code without rewriting existing
 * files would leave every step entry and spec block invisible — the log would
 * still list steps while their full context silently vanished.
 *
 * Only markers are touched. Prose that happens to mention the old name is left
 * exactly as written, because it is a record of what someone actually said.
 */
/**
 * Only markers dolly itself writes, and only at the start of a line — which is
 * how dolly writes them. Two failure modes this avoids:
 *
 *  - falsifying prose: a step note discussing `<!-- dollie:header -->` inline is
 *    a record of what someone wrote about the OLD name; rewriting it changes
 *    the meaning of their sentence
 *  - promoting text into structure: an unanchored rewrite could turn a quoted
 *    marker into a live one, fragmenting the file it was migrating
 */
const KNOWN_MARKER = String.raw`(?::(?:header|instructions|spec-current|spec-history|step\s+\S+?)|\s+(?:spec|steps|plan))`;
const LEGACY_MARKER = new RegExp(String.raw`^(<!--\s*/?\s*)dollie(${KNOWN_MARKER})`, 'gm');
const HAS_LEGACY_MARKER = new RegExp(String.raw`^<!--\s*/?\s*dollie(${KNOWN_MARKER})`, 'm');

export function rewriteMarkers(text: string): string {
  return text.replace(LEGACY_MARKER, '$1dolly$2');
}

export function hasLegacyMarkers(text: string): boolean {
  return HAS_LEGACY_MARKER.test(text);
}

export interface MigrateReport {
  dryRun: boolean;
  actions: MigrateAction[];
}

function legacyStepsDir(dir: string): string {
  return path.join(contextDir(dir), 'steps');
}

function legacySpecFiles(dir: string): string[] {
  return listFiles(contextDir(dir))
    .filter((f) => /^spec\.v\d+\.md$/.test(f))
    .sort((a, b) => version(a) - version(b));
}

function version(f: string): number {
  return Number(/^spec\.v(\d+)\.md$/.exec(f)?.[1] ?? 0);
}

function stripComments(text: string): string {
  return text.replace(/^(<!--[\s\S]*?-->\s*)+/, '').trim();
}

/**
 * Move a pre-rename `.dollie/` store to `.dolly/` and rewrite its markers.
 * Returns the store to keep working with — the caller's `store` points at a
 * directory that no longer exists once this has run.
 */
function renameStore(store: Store, dryRun: boolean, actions: MigrateAction[]): Store {
  if (!store.legacy) {
    // `.dolly/` won the lookup, but an old store may still be sitting beside it
    // holding history nobody has noticed. Say so rather than ignoring it.
    const orphan = path.join(path.dirname(store.root), LEGACY_STORE_DIRNAME);
    if (exists(orphan)) {
      actions.push({
        kind: 'store-rename',
        task: '(store)',
        detail: `${orphan} also exists and was NOT touched — merge it into ${store.root} by hand, dolly will not guess which wins`,
      });
    }
    return store;
  }
  const dest = path.join(path.dirname(store.root), STORE_DIRNAME);
  if (exists(dest)) {
    throw new Error(
      `both ${store.root} and ${dest} exist — merge them by hand, dolly will not guess which wins`,
    );
  }
  actions.push({
    kind: 'store-rename',
    task: '(store)',
    detail: `${path.basename(store.root)}/ → ${STORE_DIRNAME}/`,
  });
  if (dryRun) return store;
  move(store.root, dest);
  return new Store({ root: dest, kind: 'found', project: store.project });
}

/** rewrite markers in every file dolly parses */
function migrateMarkers(store: Store, dryRun: boolean, actions: MigrateAction[]): void {
  for (const task of store.loadTasks(true)) {
    const files = [
      path.join(task.dir, 'task.md'),
      specFile(task.dir),
      stepsFile(task.dir),
      path.join(contextDir(task.dir), 'plan.md'),
    ];
    const stale = files.filter((f) => hasLegacyMarkers(readTextOr(f)));
    if (!stale.length) continue;
    actions.push({
      kind: 'markers',
      task: `${task.meta.id} ${task.meta.slug}`,
      detail: `renamed markers in ${stale.length} file(s)`,
    });
    if (dryRun) continue;
    for (const f of stale) writeText(f, rewriteMarkers(readTextOr(f)));
  }
}

/**
 * A `user` in the shared config stamps every teammate's steps with one handle.
 * Move it to the gitignored local config, where identity belongs.
 */
function splitIdentity(store: Store, dryRun: boolean, actions: MigrateAction[]): void {
  const leaked = sharedUserLeak(store.root);
  if (!leaked) return;
  actions.push({
    kind: 'config-split',
    task: '(store)',
    detail: `user "${leaked}" moved out of the shared config.json into ${LOCAL_CONFIG} (gitignored) — it was attributing every teammate's steps to one handle`,
  });
  if (dryRun) return;
  const shared = readJson<Record<string, unknown>>(store.configPath, {});
  delete shared.user;
  writeJson(store.configPath, shared);
  const local = readJson<Record<string, unknown>>(store.localConfigPath, {});
  if (!local.user) store.saveLocal({ user: leaked });
}

export function migrate(store: Store, opts: { dryRun?: boolean } = {}): MigrateReport {
  const dryRun = Boolean(opts.dryRun);
  const actions: MigrateAction[] = [];

  store = renameStore(store, dryRun, actions);
  // Refresh the store's own scaffolding first. `init` merges any newly required
  // .gitignore entries, and migrating identity into local.json is worthless if
  // local.json is still tracked.
  if (!dryRun) store.init();
  migrateMarkers(store, dryRun, actions);
  splitIdentity(store, dryRun, actions);

  for (const task of store.loadTasks(true)) {
    const label = `${task.meta.id} ${task.meta.slug}`;

    const stepsDir = legacyStepsDir(task.dir);
    if (isDir(stepsDir)) {
      const files = listFiles(stepsDir).filter((f) => /^\d+\.md$/.test(f)).sort();
      if (files.length) {
        actions.push({
          kind: 'steps',
          task: label,
          detail: `${files.length} step file(s) → context/steps.md`,
        });
        if (!dryRun) mergeSteps(task, stepsDir, files);
      } else if (!dryRun) {
        rmrf(stepsDir);
      }
    }

    const specs = legacySpecFiles(task.dir);
    if (specs.length) {
      actions.push({
        kind: 'spec',
        task: label,
        detail: `${specs.length} spec appendix file(s) → "Superseded versions" in context/spec.md`,
      });
      if (!dryRun) mergeSpecs(task, specs);
    }
  }
  return { dryRun, actions };
}

function mergeSteps(task: Task, stepsDir: string, files: string[]): void {
  let out = readTextOr(stepsFile(task.dir));
  if (!out.trim()) {
    out = [
      `<!-- dolly steps · task ${task.meta.id} · append-only, newest at the bottom -->`,
      `# Full step context — ${task.meta.title}`,
      '',
      'Short summaries live in `../task.md`. Each entry below is the full context of one step.',
      '',
    ].join('\n');
  }
  for (const f of files) {
    const id = f.replace(/\.md$/, '');
    if (out.includes(`<!-- dolly:step ${id} -->`)) continue;
    const body = stripComments(readTextOr(path.join(stepsDir, f)));
    out = appendBlock(out, `step ${id}`, body || '_(empty)_');
  }
  writeText(stepsFile(task.dir), out);
  rmrf(stepsDir);

  // point the short log at the merged file
  task.body = task.body.replace(
    /- full: `context\/steps\/(\d+)\.md`/g,
    (_m, id: string) => `full: \`steps.md#${id}\``,
  );
  saveTask(task);
}

function mergeSpecs(task: Task, specs: string[]): void {
  const doc = readSpecDoc(task.dir);
  const bodies = specs.map((f) => ({
    v: version(f),
    text: stripComments(readTextOr(path.join(contextDir(task.dir), f))),
  }));
  const newest = bodies[bodies.length - 1];
  const current = doc?.body?.trim() || newest.text;
  // the v1 spec.md carried no version marker, so the frontmatter is the
  // authority on which version is current — not whatever readSpecDoc guessed
  const currentVersion = task.meta.spec_version || doc?.version || newest.v;
  // everything below the current version becomes history
  const history = bodies
    .filter((b) => b.v < currentVersion)
    .sort((a, b) => b.v - a.v)
    .map((b) => {
      const reason = /^>\s*change reason:\s*(.+)$/m.exec(b.text)?.[1]?.trim();
      const body = b.text.replace(/^>\s*change reason:.*$/m, '').trim();
      return [
        `## v${b.v} — migrated · @${task.meta.owner}`,
        '',
        reason ? `> superseded: ${reason}` : '> superseded (reason not recorded)',
        '',
        body,
      ].join('\n');
    });

  writeText(
    specFile(task.dir),
    [
      `<!-- dolly spec · task ${task.meta.id} -->`,
      `# Spec — ${task.meta.title}`,
      '',
      `**current: v${task.meta.spec_version}** · migrated from the v1 layout` +
        (history.length ? ' · superseded versions are kept at the bottom of this file' : ''),
      '',
      '<!-- dolly:spec-current -->',
      `<!-- v${task.meta.spec_version} · ${task.meta.updated} · @${task.meta.owner} -->`,
      '',
      current,
      '<!-- /dolly:spec-current -->',
      '',
      '---',
      '',
      '## Superseded versions',
      '',
      '<!-- dolly:spec-history -->',
      history.length ? history.join('\n\n') : '_none — v1 is the first spec_',
      '<!-- /dolly:spec-history -->',
      '',
    ].join('\n'),
  );
  for (const f of specs) rmrf(path.join(contextDir(task.dir), f));
}
