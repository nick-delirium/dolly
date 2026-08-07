import fs from 'node:fs';
import path from 'node:path';
import { move, readJson, rmrf, writeJson } from './fsx.js';
import { currentTask, readTaskDir, type Store } from './store.js';
import type { Task } from './types.js';
import {
  dropStepEntries,
  note,
  saveTask,
  specHistoryEntries,
  stepEntries,
  writeSpecHistory,
} from './task.js';
import { daysSince, monthBucket, nowIso } from './time.js';

export interface HkAction {
  kind: 'archive' | 'stale' | 'prune-steps' | 'prune-specs' | 'delete-archived';
  task: string;
  detail: string;
}

export interface HkReport {
  ran: boolean;
  dryRun: boolean;
  actions: HkAction[];
  skipped?: string;
}

function markerPath(store: Store): string {
  return path.join(store.root, '.housekeep.json');
}

export function lastRun(store: Store): string | null {
  return readJson<{ lastRun?: string }>(markerPath(store), {}).lastRun ?? null;
}

/** Called by every mutating command. No-op unless enabled and the interval elapsed. */
export function maybeAuto(store: Store): HkReport | null {
  const hk = store.config.housekeep;
  if (!hk.auto) return null;
  const last = lastRun(store);
  if (last && daysSince(last) * 24 < hk.autoEveryHours) return null;
  return housekeep(store, { dryRun: false, auto: true });
}

export function housekeep(
  store: Store,
  opts: { dryRun?: boolean; auto?: boolean } = {},
): HkReport {
  const dryRun = Boolean(opts.dryRun);
  const hk = store.config.housekeep;
  const actions: HkAction[] = [];
  // Automatic runs fire on every write, so they must never move the task
  // somebody is in the middle of. An explicit `dolly housekeep` still may.
  const protectedId = opts.auto
    ? currentTask(store.loadTasks(false), store.config)?.meta.id
    : undefined;

  for (const task of store.loadTasks(false)) {
    const age = daysSince(task.meta.updated || task.meta.created);
    const isDone = task.meta.status === store.config.doneStatus;

    if (task.meta.id === protectedId) continue;

    if (isDone && hk.archiveDoneAfterDays > 0 && age >= hk.archiveDoneAfterDays) {
      actions.push({
        kind: 'archive',
        task: label(task),
        detail: `done ${Math.round(age)}d ago → archive/${monthBucket()}`,
      });
      if (!dryRun) archiveTask(store, task);
      continue;
    }

    if (!isDone && hk.staleAfterDays > 0 && age >= hk.staleAfterDays && !task.meta.stale) {
      actions.push({
        kind: 'stale',
        task: label(task),
        detail: `untouched ${Math.round(age)}d → flagged stale`,
      });
      if (!dryRun) {
        task.meta.stale = true;
        saveTask(task);
      }
    }

    if (hk.keepFullStepsPerTask > 0) {
      const entries = stepEntries(task.dir);
      const excess = entries.length - hk.keepFullStepsPerTask;
      if (excess > 0) {
        const drop = entries.slice(0, excess).map((e) => e.id);
        actions.push({
          kind: 'prune-steps',
          task: label(task),
          detail: `full context dropped for ${drop.length} old step(s) (summaries kept)`,
        });
        if (!dryRun) pruneSteps(store, task, drop);
      }
    }

    if (hk.keepSpecVersions > 0) {
      const entries = specHistoryEntries(task.dir);
      if (entries.length > hk.keepSpecVersions) {
        const kept = entries.slice(0, hk.keepSpecVersions); // newest first
        actions.push({
          kind: 'prune-specs',
          task: label(task),
          detail: `${entries.length - kept.length} superseded spec version(s) dropped`,
        });
        if (!dryRun) writeSpecHistory(task.dir, kept);
      }
    }
  }

  if (hk.deleteArchivedAfterDays > 0) {
    for (const d of store.taskDirs(true).filter((x) => x.archived)) {
      const t = readTaskDir(d.dir, d.rel, true);
      const stamp = t?.meta.archived || t?.meta.updated || mtimeIso(d.dir);
      const age = daysSince(stamp);
      if (age >= hk.deleteArchivedAfterDays) {
        actions.push({
          kind: 'delete-archived',
          task: t ? label(t) : d.rel,
          detail: `archived ${Math.round(age)}d ago → deleted`,
        });
        if (!dryRun) rmrf(d.dir);
      }
    }
  }

  if (!dryRun) writeJson(markerPath(store), { lastRun: nowIso(), actions: actions.length });
  return { ran: true, dryRun, actions };
}

function label(task: Task): string {
  return `${task.meta.id} ${task.meta.slug}`;
}

function mtimeIso(p: string): string {
  try {
    return fs.statSync(p).mtime.toISOString();
  } catch {
    return nowIso();
  }
}

function pruneSteps(store: Store, task: Task, ids: string[]): void {
  dropStepEntries(task, ids);
  note(
    store,
    task,
    `housekeeping: dropped full context for ${ids.length} old step(s) — ${ids.join(', ')}. Summaries above unchanged.`,
  );
  saveTask(task);
}

export function archiveTask(store: Store, task: Task, reason?: string): Task {
  task.meta.archived = nowIso();
  note(store, task, `archived.${reason?.trim() ? ` ${reason.trim()}` : ''}`);
  saveTask(task);
  const bucket = monthBucket(task.meta.archived);
  const dest = path.join(store.archiveDir, bucket, path.basename(task.dir));
  move(task.dir, dest);
  const moved = readTaskDir(dest, path.relative(store.root, dest), true);
  if (!moved) throw new Error(`archive failed for ${task.meta.id}`);
  return moved;
}

export function restoreTask(store: Store, task: Task): Task {
  if (!task.archived) return task;
  const dest = path.join(store.tasksDir, path.basename(task.dir));
  move(task.dir, dest);
  const moved = readTaskDir(dest, path.relative(store.root, dest), false);
  if (!moved) throw new Error(`restore failed for ${task.meta.id}`);
  moved.meta.archived = undefined;
  moved.meta.stale = undefined;
  note(store, moved, 'restored to active tasks.');
  saveTask(moved);
  return moved;
}
