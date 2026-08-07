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
  stale?: boolean;
  /** set when housekeeping archived the task */
  archived?: string;
}

export interface Task {
  meta: TaskMeta;
  /** absolute path of the task directory */
  dir: string;
  /** relative path from the store root, e.g. tasks/0001-oauth-login */
  rel: string;
  /** raw body of task.md, frontmatter stripped */
  body: string;
  archived: boolean;
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

export interface HousekeepConfig {
  /** archive `done` tasks whose `updated` is older than N days. 0 = never */
  archiveDoneAfterDays: number;
  /** flag non-done tasks untouched for N days as stale. 0 = never */
  staleAfterDays: number;
  /** delete archived task dirs older than N days. 0 = keep forever */
  deleteArchivedAfterDays: number;
  /** keep at most N full step-context files per task. 0 = keep all */
  keepFullStepsPerTask: number;
  /** keep at most N superseded spec versions in the history section. 0 = keep all */
  keepSpecVersions: number;
  /** run housekeeping automatically at most once per `autoEveryHours` */
  auto: boolean;
  autoEveryHours: number;
}

export interface Config {
  version: number;
  statuses: Status[];
  /** statuses that mean "agent finished, human must check" */
  reviewStatus: Status;
  doneStatus: Status;
  /** sections a plan must fill before `dolly plan check` passes */
  planSections: string[];
  housekeep: HousekeepConfig;
  install: InstallConfig;
  reindex: ReindexConfig;
  /** override the auto-detected identity */
  user?: string | null;
}

export const DEFAULT_CONFIG: Config = {
  version: 1,
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
  housekeep: {
    archiveDoneAfterDays: 14,
    staleAfterDays: 60,
    deleteArchivedAfterDays: 0,
    // 0 = keep everything. Pruning deletes step bodies, and "never destructive
    // by default" is a stated invariant of the store — so this is opt-in.
    keepFullStepsPerTask: 0,
    keepSpecVersions: 0,
    auto: true,
    autoEveryHours: 24,
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
