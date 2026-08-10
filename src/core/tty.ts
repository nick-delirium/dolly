/**
 * "Is there a human at a terminal?" — the one predicate that decides whether
 * dolly is allowed to talk to a person rather than to a machine.
 *
 * Two callers depend on it and must agree: the update notice (never nag an
 * agent) and the setup wizard (never prompt a stream nobody is reading). It
 * returns the *reason* rather than a boolean so a caller can put the reason in
 * its error message, and so it can be tested from inside the very agent it is
 * meant to stay quiet in — the environment is injected, never read off
 * `process.env` directly.
 */
export interface Env {
  [k: string]: string | undefined;
}

export interface TtyOpts {
  env?: Env;
  /** override the terminal test; both streams must be a TTY when omitted */
  isTty?: boolean;
}

export function notAHuman(opts: TtyOpts = {}): string | null {
  const env = opts.env ?? process.env;
  if (env.CI) return 'CI';
  if (env.CLAUDECODE === '1' || env.CLAUDE_CODE_ENTRYPOINT) {
    return 'running inside an agent, not a terminal';
  }
  const tty = opts.isTty ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!tty) return 'not a terminal';
  return null;
}

/** convenience inverse, for the common `if (interactive())` shape */
export function interactive(opts: TtyOpts = {}): boolean {
  return notAHuman(opts) === null;
}
