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
import {
  LEGACY_STORE_DIRNAME,
  LOCAL_CONFIG,
  STORE_DIRNAME,
  Store,
  missingIgnores,
  sharedUserLeak,
  stampVersion,
  storeVersion,
} from './core/store.js';
import { contextDir, readSpecDoc, saveTask, specFile, stepsFile } from './core/task.js';
import { STORE_VERSION, type Task } from './core/types.js';

export interface MigrateAction {
  kind: 'steps' | 'spec' | 'store-rename' | 'markers' | 'config-split' | 'chain';
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

/**
 * One hop of the upgrade chain.
 *
 * `detect` returns a human description of what it would do, or null when there
 * is nothing to do — so every migration stays idempotent and `--dry-run` is
 * honest. `safe` means lossless and fine to apply unattended: it may add files
 * or rewrite dolly-owned scaffolding, but it must never move a directory, delete
 * anything, or parse prose.
 */
interface Migration {
  /** store version once this has run */
  to: number;
  name: string;
  safe: boolean;
  detect(store: Store): string | null;
  /**
   * May return a replacement Store when the root moved. Must honour `dryRun` by
   * reporting into `actions` without writing — otherwise `--dry-run` shows the
   * chain but none of the per-task detail, which is the part worth reviewing.
   */
  apply(store: Store, actions: MigrateAction[], dryRun: boolean): Store;
}

const MIGRATIONS: Migration[] = [
  {
    to: 2,
    name: 'dollie → dolly: directory and parsed markers',
    safe: false, // moves the store directory and rewrites parsed markers
    detect(store) {
      if (store.legacy) return `${path.basename(store.root)}/ → ${STORE_DIRNAME}/ and rename its markers`;
      const orphan = path.join(path.dirname(store.root), LEGACY_STORE_DIRNAME);
      if (exists(orphan)) return `${orphan} still exists beside the current store`;
      const stale = store
        .loadTasks(true)
        .filter((t) => markerFiles(t).some((f) => hasLegacyMarkers(readTextOr(f))));
      return stale.length ? `rename markers in ${stale.length} task(s)` : null;
    },
    apply(store, actions, dryRun) {
      const next = renameStore(store, dryRun, actions);
      migrateMarkers(next, dryRun, actions);
      return next;
    },
  },
  {
    to: 3,
    name: 'merged layout: one spec.md with history, one steps.md',
    safe: false, // merges and then deletes the old per-entry files
    detect(store) {
      const tasks = store.loadTasks(true).filter(
        (t) => isDir(legacyStepsDir(t.dir)) || legacySpecFiles(t.dir).length,
      );
      return tasks.length ? `merge per-step / per-version files in ${tasks.length} task(s)` : null;
    },
    apply(store, actions, dryRun) {
      mergeLegacyLayout(store, dryRun, actions);
      return store;
    },
  },
  {
    to: 4,
    name: 'identity out of the shared config, scaffolding refreshed',
    safe: true, // only writes local.json and dolly's own .gitignore
    detect(store) {
      const leak = sharedUserLeak(store.root);
      const missing = missingIgnores(store.root);
      if (!leak && !missing.length) return null;
      const parts: string[] = [];
      if (leak) parts.push(`move user "${leak}" into ${LOCAL_CONFIG} (gitignored)`);
      if (missing.length) parts.push(`add ${missing.join(', ')} to .gitignore`);
      return parts.join('; ');
    },
    apply(store, actions, dryRun) {
      if (!dryRun) store.init();
      splitIdentity(store, dryRun, actions);
      return store;
    },
  },
];

function markerFiles(task: Task): string[] {
  return [
    path.join(task.dir, 'task.md'),
    specFile(task.dir),
    stepsFile(task.dir),
    path.join(contextDir(task.dir), 'plan.md'),
  ];
}

export interface Pending {
  migration: Migration;
  detail: string;
}

/** migrations with work to do, in order */
export function pending(store: Store): Pending[] {
  const out: Pending[] = [];
  for (const m of MIGRATIONS) {
    const detail = m.detect(store);
    if (detail) out.push({ migration: m, detail });
  }
  return out;
}

export interface VersionState {
  store: number;
  code: number;
  /** the store was written by a newer dolly — writing to it would corrupt it */
  newer: boolean;
  pending: Pending[];
  unsafePending: Pending[];
}

export function versionState(store: Store): VersionState {
  const at = storeVersion(store.root);
  const p = pending(store);
  return {
    store: at,
    code: STORE_VERSION,
    newer: at > STORE_VERSION,
    pending: p,
    unsafePending: p.filter((x) => !x.migration.safe),
  };
}

/**
 * Apply the lossless migrations without being asked, and leave the rest alone.
 *
 * Called before any command touches the store. The version stamp is only
 * advanced once nothing is pending, so a store waiting on a risky migration
 * keeps warning until a human runs `dolly migrate`.
 */
export function maybeAutoMigrate(store: Store): MigrateAction[] {
  const state = versionState(store);
  if (state.newer) return [];
  const actions: MigrateAction[] = [];
  let cur = store;
  for (const { migration } of state.pending) {
    if (!migration.safe) continue;
    cur = migration.apply(cur, actions, false);
  }
  // Stamp whenever the store is structurally current, even if nothing had to be
  // applied. A store that was migrated by hand — or created before the stamp
  // existed — is otherwise re-evaluated on every single command, forever.
  if (!pending(cur).length && storeVersion(cur.root) !== STORE_VERSION) {
    stampVersion(cur.root, STORE_VERSION);
  }
  return actions;
}

export function migrate(store: Store, opts: { dryRun?: boolean } = {}): MigrateReport {
  const dryRun = Boolean(opts.dryRun);
  const actions: MigrateAction[] = [];
  const state = versionState(store);

  if (state.newer) {
    throw new Error(
      `this store is at schema version ${state.store} but this dolly only understands ${state.code} — ` +
        'upgrade dolly instead of migrating down, or you will corrupt a store a teammate is using',
    );
  }

  let cur = store;
  for (const { migration, detail } of state.pending) {
    actions.push({
      kind: 'chain',
      task: `v${migration.to}`,
      detail: `${migration.name} — ${detail}`,
    });
    cur = migration.apply(cur, actions, dryRun);
  }

  if (!dryRun) {
    const left = pending(cur);
    if (!left.length && storeVersion(cur.root) !== STORE_VERSION) {
      stampVersion(cur.root, STORE_VERSION);
      actions.push({
        kind: 'chain',
        task: `v${STORE_VERSION}`,
        detail: `store stamped as schema version ${STORE_VERSION}`,
      });
    }
  } else if (state.store !== STORE_VERSION) {
    actions.push({
      kind: 'chain',
      task: `v${STORE_VERSION}`,
      detail: `would stamp the store as schema version ${STORE_VERSION} (currently ${state.store})`,
    });
  }
  return { dryRun, actions };
}

/** the pre-0.2 per-step and per-version file merge */
function mergeLegacyLayout(store: Store, dryRun: boolean, actions: MigrateAction[]): void {
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
