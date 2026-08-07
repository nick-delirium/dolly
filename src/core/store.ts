import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_CONFIG, type Config, type Task, type TaskMeta } from './types.js';
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

const STORE_README = `# .dolly — shared task memory

Written and read by coding agents via the \`dolly\` CLI (\`npm i -g dolly\`).
Commit this directory: it is how the next session — yours or a teammate's —
knows what was decided and why.

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
  kind: 'env' | 'found' | 'repo' | 'global';
  /** project root the store describes */
  project: string;
  /** true when this is a pre-rename `.dollie/` store awaiting `dolly migrate` */
  legacy?: boolean;
}

function globalStoreFor(project: string): string {
  const hash = crypto.createHash('sha1').update(project).digest('hex').slice(0, 8);
  return path.join(os.homedir(), STORE_DIRNAME, 'projects', `${path.basename(project)}-${hash}`);
}

/**
 * `~/.dolly` is dolly's own home (identity cache + `projects/`), never a
 * project store — otherwise every project under $HOME would resolve to it.
 */
function isProjectStore(p: string): boolean {
  if (p === path.join(os.homedir(), STORE_DIRNAME)) return false;
  if (p === path.join(os.homedir(), LEGACY_STORE_DIRNAME)) return false;
  return isDir(p) && (exists(path.join(p, 'config.json')) || isDir(path.join(p, TASKS)));
}

/** Walk up looking for an existing `.dolly/`; fall back to repo root, then global. */
export function locateStore(cwd = process.cwd()): StoreLocation {
  const env = process.env.DOLLY_DIR?.trim();
  if (env) {
    const root = path.resolve(env);
    return { root, kind: 'env', project: repoRoot(cwd) ?? cwd };
  }
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
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const root = repoRoot(cwd);
  if (root) return { root: path.join(root, STORE_DIRNAME), kind: 'repo', project: root };
  return { root: globalStoreFor(path.resolve(cwd)), kind: 'global', project: path.resolve(cwd) };
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
    const want = ['.housekeep.json', LOCAL_CONFIG, '*.tmp-*', '.claude/', '.cursor/', '.codex/'];
    const have = readTextOr(ignore).split('\n').map((l) => l.trim());
    const missing = want.filter((l) => !have.includes(l));
    if (missing.length) {
      const base = readTextOr(ignore);
      writeText(ignore, `${base}${base && !base.endsWith('\n') ? '\n' : ''}${missing.join('\n')}\n`);
    }
    const readme = path.join(this.root, 'README.md');
    if (!exists(readme)) writeText(readme, STORE_README);
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
