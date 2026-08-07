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

/** backdate a task's activity (and its archive stamp, if archived) */
export function ageTask(taskDir, iso) {
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
