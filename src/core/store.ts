import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_CONFIG, STORE_VERSION, type Config, type Task, type TaskMeta } from './types.js';
import {
  ensureDir,
  exists,
  isDir,
  listDirs,
  readJson,
  readTextOr,
  writeJson,
  writeText,
} from './fsx.js';
import { parseFrontmatter } from './md.js';
import { repoRoot } from './git.js';
import { resolveIdentity, type Identity } from './identity.js';

export const STORE_DIRNAME = '.dolly';
/**
 * Per-person settings, gitignored. Identity lives here and never in the shared
 * config: a committed `user` stamps every teammate's steps with one handle,
 * which quietly destroys the attribution the store exists to provide.
 */
export const LOCAL_CONFIG = 'local.json';
/** pre-rename directory name; still discovered so `dolly migrate` can move it */
export const LEGACY_STORE_DIRNAME = '.dollie';
export const TASKS = 'tasks';
export const ARCHIVE = 'archive';

/**
 * The store explains itself to whoever opens it — including the fact that an
 * out-of-repo store is nobody else's to read, which is the opposite of the
 * advice the in-repo one gives.
 */
function storeReadme(inRepo: boolean, project: string): string {
  const opening = inRepo
    ? `Commit this directory: it is how the next session — yours or a teammate's —
knows what was decided and why.`
    : `This store sits outside the project it describes (${project}), because that
is what was chosen at setup. It is private to you: there is nothing to commit,
and a teammate cloning that repo gets their own. \`dolly setup\` moves it back
into the repo if you want it shared.`;
  return STORE_README.replace('%OPENING%', opening);
}

const STORE_README = `# .dolly — shared task memory

Written and read by coding agents via the \`dolly\` CLI (\`npm i -g dolly\`).
%OPENING%

- \`tasks/NNNN-slug/task.md\` — short spec, success criteria, and a one-line-per-event
  log. Start here. Every line is stamped with the GitHub handle of whoever did it.
- \`tasks/NNNN-slug/context/spec.md\` — current full spec at the top, every
  superseded version below it under "Superseded versions".
- \`tasks/NNNN-slug/context/steps.md\` — full context of each step, append-only:
  decisions, rejected options, gotchas, what to do next.
- \`tasks/NNNN-slug/context/plan.md\` — the planning interview, when there was one.
- \`archive/YYYY-MM/\` — tasks aged out by \`dolly housekeep\`.

Read with \`dolly board\`, \`dolly show <ref>\`, \`dolly context <ref>\`.
Do not hand-edit these files — the CLI maintains frontmatter, spec versions and
step counters.
`;

export interface StoreLocation {
  root: string;
  /** where the store lives relative to the user's project */
  kind: 'env' | 'found' | 'linked' | 'repo' | 'global';
  /** project root the store describes */
  project: string;
  /** true when this is a pre-rename `.dollie/` store awaiting `dolly migrate` */
  legacy?: boolean;
}

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

/** `~/.dolly/projects` — every store that deliberately lives outside its repo */
export function projectsDir(home = dollyHome()): string {
  return path.join(home, STORE_DIRNAME, 'projects');
}

export function indexFile(home = dollyHome()): string {
  return path.join(projectsDir(home), 'index.json');
}

export function globalStoreFor(project: string, home = dollyHome()): string {
  const hash = crypto.createHash('sha1').update(project).digest('hex').slice(0, 8);
  return path.join(projectsDir(home), `${path.basename(project)}-${hash}`);
}

/**
 * Every project dolly has seen, and what was decided about it.
 *
 * Two jobs. First, keeping a store outside its repo has to survive the next
 * command, and the repo is exactly where that answer cannot be written — a
 * pointer file in a repo the user asked to keep clean defeats the choice. So
 * the mapping lives next to the stores it points at.
 *
 * Second, `local` is recorded explicitly rather than implied by the absence of
 * an entry. Otherwise "deliberately in the repo" and "never set up" look
 * identical, and there is nowhere to answer "which projects does dolly know".
 *
 * It is deliberately *descriptive, not authoritative*: resolution consults it
 * only when no `.dolly/` was found on disk. A directory that exists cannot be
 * wrong about existing, while an entry can be stale in every direction — store
 * deleted, project moved, dotfiles half-synced onto a new machine.
 *
 * Paths are keyed by realpath, so a symlinked or bind-mounted checkout resolves
 * to the same entry instead of quietly getting a second store.
 */
export interface ProjectEntry {
  /** project root this entry describes */
  path: string;
  /** true when the store lives inside the project — committed, shared */
  local: boolean;
  /** absolute store root */
  store: string;
  created: string;
}

export interface ProjectIndex {
  [projectPath: string]: ProjectEntry;
}

export function projectKey(p: string): string {
  const abs = path.resolve(p);
  try {
    return fs.realpathSync(abs);
  } catch {
    return abs;
  }
}

/**
 * Read tolerantly: the first shape of this file mapped a path straight to a
 * store root, and was only ever written for out-of-repo stores. Normalising on
 * read means no migration — the entry gains its fields the next time it is
 * written.
 */
export function readProjectIndex(file = indexFile()): ProjectIndex {
  const raw = readJson<Record<string, unknown>>(file, {});
  const out: ProjectIndex = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string' && v) {
      out[k] = { path: k, local: false, store: v, created: '' };
      continue;
    }
    if (v && typeof v === 'object') {
      const e = v as Partial<ProjectEntry>;
      if (typeof e.store === 'string' && e.store) {
        out[k] = {
          path: typeof e.path === 'string' && e.path ? e.path : k,
          local: e.local === true,
          store: e.store,
          created: typeof e.created === 'string' ? e.created : '',
        };
      }
    }
  }
  return out;
}

export function projectEntry(project: string, file = indexFile()): ProjectEntry | null {
  return readProjectIndex(file)[projectKey(project)] ?? null;
}

/**
 * Record what this project's store is and whether it lives in the repo.
 * A no-op when nothing changed, so it can be called on any write without
 * rewriting a global file on every command.
 */
export function recordProject(
  project: string,
  opts: { store: string; local: boolean },
  file = indexFile(),
): void {
  const index = readProjectIndex(file);
  const key = projectKey(project);
  const next: ProjectEntry = {
    path: key,
    local: opts.local,
    store: path.resolve(opts.store),
    created: index[key]?.created || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };
  const prev = index[key];
  if (prev && prev.local === next.local && prev.store === next.store && prev.created === next.created) {
    return;
  }
  index[key] = next;
  writeJson(file, index);
}

export function forgetProject(project: string, file = indexFile()): void {
  const index = readProjectIndex(file);
  const key = projectKey(project);
  if (!(key in index)) return;
  delete index[key];
  writeJson(file, index);
}

/**
 * The store this project was linked to, or null. An entry pointing at a
 * directory that is no longer a store is treated as absent rather than as an
 * error: a deleted or moved store must degrade to the normal lookup, never
 * strand every command behind a stale line of JSON.
 */
export function linkedStore(project: string, file = indexFile()): string | null {
  const entry = readProjectIndex(file)[projectKey(project)];
  if (!entry) return null;
  return isProjectStore(entry.store) ? entry.store : null;
}

/**
 * The registry and the disk disagree: a `.dolly/` was found in the project, but
 * the recorded decision points somewhere else that also exists.
 *
 * Reachable in ordinary use — go private, then pull a branch where a teammate
 * committed `.dolly/`. Either resolution surprises someone, so dolly resolves to
 * the repo (the shared choice, and the one a whole team can see) and reports the
 * disagreement rather than picking in silence.
 */
export function storeConflict(
  loc: StoreLocation,
  file = indexFile(),
): { recorded: ProjectEntry; using: string } | null {
  if (loc.kind !== 'found') return null;
  const entry = readProjectIndex(file)[projectKey(loc.project)];
  if (!entry || entry.local) return null;
  if (path.resolve(entry.store) === path.resolve(loc.root)) return null;
  if (!isProjectStore(entry.store)) return null;
  return { recorded: entry, using: loc.root };
}

/**
 * `~/.dolly` is dolly's own home (identity cache + `projects/`), never a
 * project store — otherwise every project under $HOME would resolve to it.
 */
function isProjectStore(p: string): boolean {
  if (p === path.join(dollyHome(), STORE_DIRNAME)) return false;
  if (p === path.join(dollyHome(), LEGACY_STORE_DIRNAME)) return false;
  return isDir(p) && (exists(path.join(p, 'config.json')) || isDir(path.join(p, TASKS)));
}

/**
 * Where this project's store lives. Precedence, nearest first:
 *   DOLLY_DIR → a real `.dolly/` found walking up → a linked store for that
 *   same directory → repo root → `~/.dolly/projects/<name>-<hash>`.
 *
 * Both directory tests happen at every level of the walk, so "nearest wins"
 * holds across the two mechanisms: a `.dolly/` sitting in a directory beats an
 * index entry for that directory, and either beats anything further up.
 */
export function locateStore(cwd = process.cwd()): StoreLocation {
  const env = process.env.DOLLY_DIR?.trim();
  if (env) {
    const root = path.resolve(env);
    return { root, kind: 'env', project: repoRoot(cwd) ?? cwd };
  }
  // Read the registry once for the whole walk. Reading it per level meant one
  // `dolly board` from a deep directory re-read the same file 26 times: every
  // ancestor, times every locateStore() call a command makes.
  const index = readProjectIndex();
  let dir = path.resolve(cwd);
  for (;;) {
    for (const name of [STORE_DIRNAME, LEGACY_STORE_DIRNAME]) {
      const candidate = path.join(dir, name);
      if (isProjectStore(candidate)) {
        return {
          root: candidate,
          kind: 'found',
          project: dir,
          legacy: name === LEGACY_STORE_DIRNAME,
        };
      }
    }
    const entry = index[projectKey(dir)];
    if (entry && isProjectStore(entry.store)) {
      return { root: entry.store, kind: 'linked', project: dir };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const root = repoRoot(cwd);
  if (root) return { root: path.join(root, STORE_DIRNAME), kind: 'repo', project: root };
  return { root: globalStoreFor(path.resolve(cwd)), kind: 'global', project: path.resolve(cwd) };
}

/**
 * Move a store, task memory intact. This is the only copy of the user's
 * history, so: refuse a destination that already holds anything, copy before
 * removing, and verify the task directories arrived — a truncated copy that
 * then deletes the source is the one failure this must never have.
 */
export function moveStore(from: string, to: string): void {
  if (!isDir(from)) throw new Error(`no store at ${from}`);
  if (path.resolve(from) === path.resolve(to)) return;
  if (exists(to) && fs.readdirSync(to).length) throw new Error(`destination is not empty: ${to}`);

  const before = listDirs(path.join(from, TASKS));
  ensureDir(path.dirname(to));
  fs.cpSync(from, to, { recursive: true });

  const after = listDirs(path.join(to, TASKS));
  if (before.length !== after.length || before.some((d, i) => d !== after[i])) {
    fs.rmSync(to, { recursive: true, force: true });
    throw new Error(`copy verification failed (${before.length} task(s) in, ${after.length} out) — nothing moved`);
  }
  fs.rmSync(from, { recursive: true, force: true });
}

export class Store {
  readonly root: string;
  readonly project: string;
  readonly kind: StoreLocation['kind'];
  /** a pre-rename `.dollie/` store — readable, but `dolly migrate` should move it */
  readonly legacy: boolean;
  readonly config: Config;
  private _identity?: Identity;

  constructor(loc: StoreLocation) {
    this.root = loc.root;
    this.project = loc.project;
    this.kind = loc.kind;
    this.legacy = Boolean(loc.legacy);
    this.config = loadConfig(loc.root);
  }

  static open(cwd = process.cwd()): Store {
    return new Store(locateStore(cwd));
  }

  get exists(): boolean {
    return isDir(this.root);
  }

  get configPath(): string {
    return path.join(this.root, 'config.json');
  }

  /** gitignored, per-machine. Identity and anything else that must not be shared. */
  get localConfigPath(): string {
    return path.join(this.root, LOCAL_CONFIG);
  }

  saveLocal(patch: Record<string, unknown>): void {
    const cur = readJson<Record<string, unknown>>(this.localConfigPath, {});
    writeJson(this.localConfigPath, { ...cur, ...patch });
  }

  get tasksDir(): string {
    return path.join(this.root, TASKS);
  }

  get archiveDir(): string {
    return path.join(this.root, ARCHIVE);
  }

  get identity(): Identity {
    if (!this._identity) this._identity = resolveIdentity(this.project, this.config.user);
    return this._identity;
  }

  get user(): string {
    return this.identity.user;
  }

  init(): void {
    ensureDir(this.tasksDir);
    ensureDir(this.archiveDir);
    if (!exists(this.configPath)) writeJson(this.configPath, DEFAULT_CONFIG);
    // Machine-local state must never reach the shared store: the housekeeping
    // marker would conflict on every pull, and agents sometimes drop their own
    // per-user settings inside whatever directory they are pointed at.
    // Merged rather than overwritten so an older store gains new entries.
    const ignore = path.join(this.root, '.gitignore');
    const want = REQUIRED_IGNORES;
    const have = readTextOr(ignore).split('\n').map((l) => l.trim());
    const missing = want.filter((l) => !have.includes(l));
    if (missing.length) {
      const base = readTextOr(ignore);
      writeText(ignore, `${base}${base && !base.endsWith('\n') ? '\n' : ''}${missing.join('\n')}\n`);
    }
    const readme = path.join(this.root, 'README.md');
    if (!exists(readme)) {
      writeText(readme, storeReadme(this.inProject, this.project));
    }
    // Register the project the first time anything writes to its store, so
    // `dolly projects` sees a repo that was set up before the registry existed,
    // or cloned from a teammate, without anyone running a command for it.
    // `recordProject` is a no-op when nothing changed, so this is not a global
    // write on every command. A DOLLY_DIR store was pinned by the environment
    // rather than chosen, so it is left out.
    if (this.kind !== 'env') {
      recordProject(this.project, { store: this.root, local: this.inProject });
    }
  }

  /** does the store live inside the project it describes? */
  get inProject(): boolean {
    return path.dirname(path.resolve(this.root)) === path.resolve(this.project);
  }

  saveConfig(next: Config): void {
    // `user` is per-person and lives in the gitignored local config; writing it
    // here would reintroduce the misattribution this split exists to prevent
    const { user: _user, ...shared } = next;
    writeJson(this.configPath, shared);
  }

  /** every task dir under tasks/ plus, when asked, archive/<bucket>/ */
  taskDirs(includeArchived = false): { dir: string; rel: string; archived: boolean }[] {
    const out: { dir: string; rel: string; archived: boolean }[] = [];
    for (const name of listDirs(this.tasksDir)) {
      out.push({ dir: path.join(this.tasksDir, name), rel: `${TASKS}/${name}`, archived: false });
    }
    if (includeArchived) {
      for (const bucket of listDirs(this.archiveDir)) {
        for (const name of listDirs(path.join(this.archiveDir, bucket))) {
          out.push({
            dir: path.join(this.archiveDir, bucket, name),
            rel: `${ARCHIVE}/${bucket}/${name}`,
            archived: true,
          });
        }
      }
    }
    return out;
  }

  loadTasks(includeArchived = false): Task[] {
    const tasks: Task[] = [];
    for (const d of this.taskDirs(includeArchived)) {
      const t = readTaskDir(d.dir, d.rel, d.archived);
      if (t) tasks.push(t);
    }
    return tasks.sort((a, b) => a.meta.id.localeCompare(b.meta.id));
  }

  /**
   * Resolve a user-supplied reference: exact id ("7" or "0007"), exact slug,
   * unique slug/title substring, or `current` / `@` for the active task.
   */
  resolve(ref: string, includeArchived = true): Task {
    const tasks = this.loadTasks(includeArchived);
    if (!tasks.length) throw new Error('no tasks yet — run `dolly new "<title>"`');

    if (ref === 'current' || ref === '@' || ref === '.') {
      const active = currentTask(tasks, this.config);
      if (!active) throw new Error('no active task (none in working/validating/planning)');
      return active;
    }

    const padded = /^\d+$/.test(ref) ? ref.padStart(4, '0') : null;
    const byId = tasks.filter((t) => t.meta.id === ref || (padded && t.meta.id === padded));
    if (byId.length === 1) return byId[0];

    const bySlug = tasks.filter((t) => t.meta.slug === ref);
    if (bySlug.length === 1) return bySlug[0];

    const needle = ref.toLowerCase();
    const fuzzy = tasks.filter(
      (t) =>
        t.meta.slug.includes(needle) ||
        t.meta.title.toLowerCase().includes(needle) ||
        t.rel.toLowerCase().includes(needle),
    );
    if (fuzzy.length === 1) return fuzzy[0];
    if (fuzzy.length > 1) {
      const list = fuzzy.map((t) => `${t.meta.id} ${t.meta.slug}`).join(', ');
      throw new Error(`ambiguous task ref "${ref}" — matches: ${list}`);
    }
    throw new Error(`no task matching "${ref}"`);
  }

  nextId(): string {
    let max = 0;
    for (const d of this.taskDirs(true)) {
      const m = /^(\d+)-/.exec(path.basename(d.dir));
      if (m) max = Math.max(max, Number(m[1]));
    }
    return String(max + 1).padStart(4, '0');
  }
}

/** entries the store's own .gitignore must contain */
export const REQUIRED_IGNORES = [
  '.housekeep.json',
  LOCAL_CONFIG,
  '*.tmp-*',
  '.claude/',
  '.cursor/',
  '.codex/',
];

/** ignore entries not yet present — a store written by an older dolly lacks them */
export function missingIgnores(root: string): string[] {
  const have = readTextOr(path.join(root, '.gitignore'))
    .split('\n')
    .map((l) => l.trim());
  return REQUIRED_IGNORES.filter((l) => !have.includes(l));
}

/**
 * The version stamped in the store, or 1 for a store old enough to predate the
 * stamp being read at all. An absent config.json means a fresh store, which is
 * current by definition.
 */
export function storeVersion(root: string): number {
  if (!exists(path.join(root, 'config.json'))) return STORE_VERSION;
  const raw = readJson<Partial<Config>>(path.join(root, 'config.json'), {});
  const v = Number(raw.version);
  return Number.isFinite(v) && v > 0 ? v : 1;
}

export function stampVersion(root: string, version: number): void {
  const raw = readJson<Record<string, unknown>>(path.join(root, 'config.json'), {});
  writeJson(path.join(root, 'config.json'), { ...raw, version });
}

export function loadConfig(root: string): Config {
  const raw = readJson<Partial<Config>>(path.join(root, 'config.json'), {});
  const local = readJson<Partial<Config>>(path.join(root, LOCAL_CONFIG), {});
  // A `user` in the shared config is ignored on purpose — see LOCAL_CONFIG.
  // `dolly migrate` moves a stale one out and reports it.
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    housekeep: { ...DEFAULT_CONFIG.housekeep, ...(raw.housekeep ?? {}) },
    install: { ...DEFAULT_CONFIG.install, ...(raw.install ?? {}) },
    reindex: { ...DEFAULT_CONFIG.reindex, ...(raw.reindex ?? {}) },
    statuses: raw.statuses?.length ? raw.statuses : DEFAULT_CONFIG.statuses,
    planSections: raw.planSections?.length ? raw.planSections : DEFAULT_CONFIG.planSections,
    user: local.user ?? null,
  };
}

/** a `user` sitting in the shared config, which would misattribute teammates */
export function sharedUserLeak(root: string): string | null {
  const raw = readJson<Partial<Config>>(path.join(root, 'config.json'), {});
  return typeof raw.user === 'string' && raw.user.trim() ? raw.user.trim() : null;
}

export function readTaskDir(dir: string, rel: string, archived: boolean): Task | null {
  const file = path.join(dir, 'task.md');
  if (!exists(file)) return null;
  const raw = readTextOr(file);
  const { front, body } = parseFrontmatter(raw);
  const base = path.basename(dir);
  const m = /^(\d+)-(.*)$/.exec(base);
  const meta: TaskMeta = {
    id: String(front.id ?? m?.[1] ?? base),
    slug: String(front.slug ?? m?.[2] ?? base),
    title: String(front.title ?? m?.[2] ?? base),
    status: String(front.status ?? 'todo'),
    owner: String(front.owner ?? 'unknown'),
    collaborators: toStrArray(front.collaborators),
    tags: toStrArray(front.tags),
    steps: Number(front.steps ?? 0) || 0,
    spec_version: Number(front.spec_version ?? 1) || 1,
    created: String(front.created ?? ''),
    updated: String(front.updated ?? front.created ?? ''),
    sessions: toStrArray(front.sessions),
    stale: front.stale === true ? true : undefined,
    archived: front.archived ? String(front.archived) : undefined,
  };
  return { meta, dir, rel, body, archived };
}

function toStrArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => x != null).map(String);
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return [];
}

/**
 * Newest activity first. Timestamps are second-precision, so events inside the
 * same second tie — break by id descending so ordering is deterministic rather
 * than dependent on directory read order.
 */
export function byRecency(a: Task, b: Task): number {
  return b.meta.updated.localeCompare(a.meta.updated) || b.meta.id.localeCompare(a.meta.id);
}

/** the task an agent is presumed to be working on right now */
export function currentTask(tasks: Task[], config: Config): Task | null {
  const priority = ['working', 'validating', 'planning'];
  const live = tasks.filter((t) => !t.archived && t.meta.status !== config.doneStatus);
  for (const status of priority) {
    const hits = live.filter((t) => t.meta.status === status).sort(byRecency);
    if (hits.length) return hits[0];
  }
  return null;
}

export function slugify(s: string, max = 48): string {
  const slug = s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
  return slug || 'task';
}
