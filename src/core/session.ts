import path from 'node:path';
import { readJson, writeJson } from './fsx.js';
import { localDir } from './lock.js';

/**
 * Which agent conversation is running right now.
 *
 * Claude Code exports `CLAUDE_CODE_SESSION_ID`, and it is exactly the basename
 * of the session's transcript — so dolly can attribute a step to a
 * conversation, and later reopen it, without parsing anything. zcode injects
 * the same value as `CLAUDE_SESSION_ID` into hook processes.
 */
export function currentSessionId(): string | null {
  const v =
    process.env.DOLLY_SESSION_ID?.trim() ||
    process.env.DOLLIE_SESSION_ID?.trim() || // pre-rename name, still honoured
    process.env.CLAUDE_CODE_SESSION_ID?.trim() ||
    process.env.CLAUDE_SESSION_ID?.trim(); // zcode hooks
  return v || null;
}

/** true when dolly is being run by Claude Code itself, not by a human shell */
export function insideClaudeCode(): boolean {
  return process.env.CLAUDECODE === '1' || Boolean(process.env.CLAUDE_CODE_ENTRYPOINT);
}

/** the command that reopens a conversation */
export function resumeCommand(sessionId: string, fork = false): string {
  return `claude --resume ${sessionId}${fork ? ' --fork-session' : ''}`;
}

/* --------------------------- session boundaries --------------------------- */

/**
 * When each conversation last crossed a turn boundary (session start, or the
 * end of a turn), per machine, in the store's gitignored `.local/`. A harness
 * whose turn-end payload carries no start time (zcode) still needs one to tell
 * "the agent logged a step during this turn" from "that step is older" —
 * without it both the agent's step and the auto-step got logged.
 */
function boundariesFile(storeRoot: string): string {
  return path.join(localDir(storeRoot), 'sessions.json');
}

export interface Boundary {
  /** ms epoch of the boundary */
  at: number;
  /** the task auto-log targeted at that boundary, and its step count then */
  task?: string;
  steps?: number;
}

export function sessionBoundary(storeRoot: string, session: string): Boundary | null {
  const all = readJson<Record<string, { at?: string; task?: string; steps?: number }>>(boundariesFile(storeRoot), {});
  const b = all[session];
  const at = Date.parse(b?.at ?? '');
  if (!Number.isFinite(at)) return null;
  return { at, task: b?.task, steps: typeof b?.steps === 'number' ? b.steps : undefined };
}

export function markSessionBoundary(
  storeRoot: string,
  session: string,
  extra: { task?: string; steps?: number } = {},
): void {
  const file = boundariesFile(storeRoot);
  const all = readJson<Record<string, { at: string; task?: string; steps?: number }>>(file, {});
  all[session] = { at: new Date().toISOString(), ...extra };
  // a month of conversations is plenty; the file must not grow forever
  const cutoff = Date.now() - 30 * 86_400_000;
  for (const [k, v] of Object.entries(all)) if (!(Date.parse(v?.at ?? '') > cutoff)) delete all[k];
  try {
    writeJson(file, all);
  } catch {
    /* best effort: a missing boundary only weakens dedup */
  }
}
