/**
 * One writer at a time per store.
 *
 * Every write is read-modify-write of task.md and steps.md, and the step number
 * comes from the frontmatter counter — so two writers that overlap (parallel
 * subagents, an MCP call beside a hook, two Stop hooks for one turn) both read
 * step N, both write N+1, and one log line is lost. A lock per task would need
 * every caller to re-read under it; a lock per store, taken BEFORE the command
 * loads anything, makes every load fresh by construction.
 *
 * The lock is a hard link created under the store's gitignored `.local/`.
 * It records its owner's pid, so a holder that died (`process.exit` inside a
 * command skips `finally`) is detected and cleared instead of wedging the store.
 */
import fs from 'node:fs';
import path from 'node:path';

/** gitignored, per-machine state inside a store: locks, session boundaries */
export function localDir(storeRoot: string): string {
  return path.join(storeRoot, '.local');
}

const WAIT_MS = 10_000;
/** a live holder this old is wedged, not busy */
const STALE_MS = 120_000;

const sleeper = new Int32Array(new SharedArrayBuffer(4));
const sleep = (ms: number) => Atomics.wait(sleeper, 0, 0, ms);

function alive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: exists, owned by someone else
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export class StoreLocked extends Error {
  constructor(file: string, holder: string) {
    super(`the store is busy — ${holder} has held ${file} for over ${WAIT_MS / 1000}s; retry, or delete the file if that process is gone`);
    this.name = 'StoreLocked';
  }
}

const held = new Map<string, number>();

function acquire(storeRoot: string, label: string): string {
  const file = path.join(localDir(storeRoot), 'write.lock');
  const depth = held.get(file);
  if (depth) {
    held.set(file, depth + 1);
    return file;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    // write the owner first, then link it into place: link() is atomic and
    // fails on an existing name, so the lock never exists without its pid. An
    // open('wx') + write left a window where a waiter read an empty file, took
    // the holder for dead, and deleted a live lock.
    const tmp = `${file}.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmp, `${process.pid} ${label}\n`);
    try {
      fs.linkSync(tmp, file);
      held.set(file, 1);
      return file;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    } finally {
      fs.rmSync(tmp, { force: true });
    }
    let holder = '';
    let age = 0;
    try {
      holder = fs.readFileSync(file, 'utf8').trim();
      age = Date.now() - fs.statSync(file).mtimeMs;
    } catch {
      continue; // released between our open and our read
    }
    const pid = Number(holder.split(' ')[0]);
    if (!alive(pid) || age > STALE_MS) {
      // only the lock judged stale: another waiter may have cleared it and
      // taken a fresh one in the meantime
      try {
        if (fs.readFileSync(file, 'utf8').trim() === holder) fs.rmSync(file, { force: true });
      } catch {
        /* already gone */
      }
      continue;
    }
    if (Date.now() > deadline) throw new StoreLocked(file, `pid ${holder}`);
    sleep(25);
  }
}

function release(file: string): void {
  const depth = held.get(file) ?? 0;
  if (depth > 1) {
    held.set(file, depth - 1);
    return;
  }
  held.delete(file);
  fs.rmSync(file, { force: true });
}

// a command that calls process.exit() mid-write never reaches `finally`
process.on('exit', () => {
  for (const file of held.keys()) fs.rmSync(file, { force: true });
});

/** run `fn` holding the store's write lock; reentrant within one process */
export function withStoreLock<T>(storeRoot: string, label: string, fn: () => T): T {
  const file = acquire(storeRoot, label);
  try {
    return fn();
  } finally {
    release(file);
  }
}

export async function withStoreLockAsync<T>(storeRoot: string, label: string, fn: () => Promise<T>): Promise<T> {
  const file = acquire(storeRoot, label);
  try {
    return await fn();
  } finally {
    release(file);
  }
}
