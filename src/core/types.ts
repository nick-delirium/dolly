/**
 * On-disk schema version of a store.
 *
 * 1 — 0.1.x: context/spec.vN.md appendices, context/steps/NNNN.md per step
 * 2 — the dollie -> dolly rename: directory name and parsed block markers
 * 3 — merged layout: one spec.md with history, one steps.md with every entry
 * 4 — identity split out of the shared config into gitignored local.json
 * 5 — housekeeping removed: archive/YYYY-MM/ flattened back into tasks/
 * 6 — sequential ids rewritten to random hash ids
 *
 * Bump this and add a Migration whenever the layout changes. A store stamped
 * higher than this is from a newer dolly and must not be written to.
 */
export const STORE_VERSION = 6;

export const DEFAULT_STATUSES = [
  'todo',
  'planning',
  'working',
  'validating',
  'done',
] as const;

export type Status = string;

export interface TaskMeta {
  id: string;
  slug: string;
  title: string;
  status: Status;
  owner: string;
  collaborators: string[];
  tags: string[];
  steps: number;
  spec_version: number;
  created: string;
  updated: string;
  /** Claude Code session ids this task was worked in, oldest first */
  sessions: string[];
}

export interface Task {
  meta: TaskMeta;
  /** absolute path of the task directory */
  dir: string;
  /** relative path from the store root, e.g. tasks/0001-oauth-login */
  rel: string;
  /** raw body of task.md, frontmatter stripped */
  body: string;
}

export interface InstallConfig {
  /**
   * Where `dolly init` / `dolly install` write agent instructions.
   * local  = this project (.claude/, .cursor/, CLAUDE.md, AGENTS.md, …)
   * global = your user config (~/.claude/, ~/.claude.json, …)
   */
  scope: 'local' | 'global';
  /** register the MCP server for agents that support it */
  mcp: boolean;
}

export interface ReindexConfig {
  /**
   * Append a mechanical step for each finished turn that the agent did not log
   * itself. Driven by the Stop hook, so "log every major point" needs no
   * discipline from the agent — it only has to improve on the summary.
   */
  autoLog: boolean;
  /** only auto-log while the task is actively being worked */
  autoLogOnlyWhenWorking: boolean;
  /** capture raw reasoning in imports. Verbose and often superseded — see docs */
  includeThinking: boolean;
}

export interface MemoConfig {
  /**
   * When true, the session-start hook notes it when today has no memo yet —
   * a nudge, never an auto-write. The memo itself is always written on purpose.
   */
  auto: boolean;
}

export interface Config {
  /** on-disk schema version; see STORE_VERSION */
  version: number;
  statuses: Status[];
  /** statuses that mean "agent finished, human must check" */
  reviewStatus: Status;
  doneStatus: Status;
  /** sections a plan must fill before `dolly plan check` passes */
  planSections: string[];
  memo: MemoConfig;
  install: InstallConfig;
  reindex: ReindexConfig;
  /** override the auto-detected identity */
  user?: string | null;
}

export const DEFAULT_CONFIG: Config = {
  version: STORE_VERSION,
  statuses: [...DEFAULT_STATUSES],
  reviewStatus: 'validating',
  doneStatus: 'done',
  planSections: [
    'Problem',
    'Goal',
    'Scope',
    'Success Criteria',
    'Changes',
    'Risks',
    'Test Plan',
    'Open Questions',
  ],
  memo: {
    auto: false,
  },
  install: {
    scope: 'local',
    mcp: true,
  },
  reindex: {
    autoLog: true,
    autoLogOnlyWhenWorking: true,
    includeThinking: false,
  },
  user: null,
};
