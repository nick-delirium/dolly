import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Fresh isolated store per test. DOLLY_DIR wins over cwd discovery. */
export function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dolly-test-'));
  process.env.DOLLY_DIR = path.join(dir, '.dolly');
  process.env.DOLLY_USER = 'tester';
  // tests must not inherit the session of whatever agent is running them
  delete process.env.DOLLY_SESSION_ID;
  delete process.env.CLAUDE_CODE_SESSION_ID;
  return {
    dir,
    store: process.env.DOLLY_DIR,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

/**
 * Backdate a task's activity (and its archive stamp, if archived). A task with
 * a log is read from the log, so that is what gets backdated: every event's
 * time — `updated` is derived from the newest one — and task.md is left to be
 * re-rendered.
 */
export function ageTask(taskDir, iso) {
  const log = path.join(taskDir, 'log.jsonl');
  if (fs.existsSync(log)) {
    const lines = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => {
      const e = JSON.parse(l);
      e.at = iso;
      if (e.base) e.base.meta.updated = iso;
      return JSON.stringify(e);
    });
    fs.writeFileSync(log, `${lines.join('\n')}\n`, 'utf8');
  }
  const file = path.join(taskDir, 'task.md');
  const raw = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(
    file,
    raw
      .replace(/^updated: .*$/m, `updated: ${iso}`)
      .replace(/^archived: .*$/m, `archived: ${iso}`),
    'utf8',
  );
}

export const daysAgo = (n) =>
  new Date(Date.now() - n * 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
