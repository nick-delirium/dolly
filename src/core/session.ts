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
