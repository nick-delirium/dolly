/**
 * Reader for Claude Code session transcripts
 * (`~/.claude/projects/<escaped-cwd>/<session-id>.jsonl`).
 *
 * Used by `dolly reindex` to attach dolly to a conversation that is already
 * in flight: the transcript supplies turn boundaries, timestamps, the user's
 * verbatim requests and the exact files touched — the mechanical facts an agent
 * cannot reliably reconstruct from a context window that may have been
 * compacted.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isDir, listFiles, readTextOr } from './fsx.js';

export interface Segment {
  /** 1-based position in the session */
  index: number;
  /** uuid of the user turn that opened this segment — the import key */
  uuid: string;
  at: string;
  endedAt: string;
  /** the user's request, verbatim, with injected reminders stripped */
  prompt: string;
  /** repo-relative paths written or edited during this segment */
  files: string[];
  commands: string[];
  tools: Record<string, number>;
  /**
   * Every user-visible assistant message, in order. This is what the agent said
   * it understood and did — the primary source for a step summary.
   */
  assistantTexts: string[];
  /** ordered, compressed record of what the agent actually ran */
  workChain: string[];
  /** raw reasoning, only populated when explicitly requested */
  thinking: string[];
  /** subagent turns that ran inside this segment */
  sidechains: number;
}

export interface ParseOpts {
  /**
   * Capture thinking blocks. Off by default: reasoning is verbose, frequently
   * contradicted later in the same turn, and the conclusions that matter
   * already surface in the visible messages and the work chain.
   */
  includeThinking?: boolean;
}

export interface Transcript {
  sessionId: string;
  file: string;
  cwd: string;
  branch: string;
  title: string;
  slug: string;
  startedAt: string;
  endedAt: string;
  segments: Segment[];
  tools: Record<string, number>;
  /** prompts that were dropped as interrupts/duplicates */
  skipped: number;
}

export interface SessionRef {
  sessionId: string;
  file: string;
  mtime: number;
  size: number;
  /** which harness produced this transcript */
  kind: 'claude' | 'opencode';
}

function projectsRoot(): string {
  return (
    process.env.DOLLY_TRANSCRIPT_DIR?.trim() ||
    process.env.DOLLIE_TRANSCRIPT_DIR?.trim() ||
    path.join(os.homedir(), '.claude', 'projects')
  );
}

/**
 * Root of the per-turn JSONL mirrors the generated opencode plugin appends to.
 * opencode itself keeps sessions in SQLite with no stable on-disk format, so
 * reindexing an opencode conversation reads this mirror instead
 * (`~/.local/share/opencode/dolly/<escaped-cwd>/<session>.jsonl`).
 */
function opencodeRoot(): string {
  return (
    process.env.DOLLY_OPENCODE_DIR?.trim() ||
    path.join(os.homedir(), '.local', 'share', 'opencode', 'dolly')
  );
}

/** Claude Code flattens the cwd into a directory name by replacing non-alphanumerics */
function escapeCwd(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-');
}

/** transcript directories that could belong to this project, best match first */
function candidateDirs(root: string, cwd: string): string[] {
  if (!isDir(root)) return [];
  const wanted = escapeCwd(cwd);
  let real = wanted;
  try {
    real = escapeCwd(fs.realpathSync(cwd));
  } catch {
    /* cwd may not exist yet */
  }
  const out: string[] = [];
  for (const name of [wanted, real]) {
    const p = path.join(root, name);
    if (isDir(p) && !out.includes(p)) out.push(p);
  }
  // fall back to any directory whose name ends with this project's basename
  const tail = `-${escapeCwd(path.basename(cwd))}`;
  for (const name of fs.readdirSync(root)) {
    const p = path.join(root, name);
    if (name.endsWith(tail) && isDir(p) && !out.includes(p)) out.push(p);
  }
  return out;
}

export function listSessions(cwd: string): SessionRef[] {
  const out: SessionRef[] = [];
  for (const dir of [...candidateDirs(projectsRoot(), cwd), ...candidateDirs(opencodeRoot(), cwd)]) {
    const kind: SessionRef['kind'] = dir.startsWith(opencodeRoot()) ? 'opencode' : 'claude';
    for (const name of listFiles(dir)) {
      if (!name.endsWith('.jsonl')) continue;
      const file = path.join(dir, name);
      let st: fs.Stats;
      try {
        st = fs.statSync(file);
      } catch {
        continue;
      }
      out.push({
        sessionId: name.replace(/\.jsonl$/, ''),
        file,
        mtime: st.mtimeMs,
        size: st.size,
        kind,
      });
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

/**
 * Resolve which transcript to read. Explicit file wins, then a session id or
 * prefix, then the most recently written session for this cwd — which, while
 * an agent is running, is the conversation it is in.
 */
export function resolveSession(cwd: string, opts: { file?: string; session?: string }): SessionRef {
  if (opts.file) {
    const file = path.resolve(opts.file);
    if (!fs.existsSync(file)) throw new Error(`transcript not found: ${file}`);
    const st = fs.statSync(file);
    return {
      sessionId: path.basename(file).replace(/\.jsonl$/, ''),
      file,
      mtime: st.mtimeMs,
      size: st.size,
      kind: file.startsWith(opencodeRoot()) ? 'opencode' : 'claude',
    };
  }
  const all = listSessions(cwd);
  if (!all.length) {
    throw new Error(
      `no transcripts found for ${cwd} — looked in ${projectsRoot()} (Claude Code) and ${opencodeRoot()} (opencode). Pass --file <path.jsonl>`,
    );
  }
  if (opts.session) {
    const hits = all.filter((s) => s.sessionId.startsWith(opts.session!));
    if (!hits.length) throw new Error(`no session matching "${opts.session}"`);
    if (hits.length > 1) {
      throw new Error(
        `ambiguous session "${opts.session}" — matches ${hits.map((h) => h.sessionId.slice(0, 8)).join(', ')}`,
      );
    }
    return hits[0];
  }
  return all[0];
}

/* -------------------------------- parsing -------------------------------- */

type Json = Record<string, any>;

const REMINDER = /<system-reminder>[\s\S]*?<\/system-reminder>/g;
const COMMAND_WRAPPER = /<command-(name|message|args)>[\s\S]*?<\/command-\1>/g;
const HOOK_LINE = /^\s*(UserPromptSubmit hook additional context|SessionStart[a-zA-Z:]* hook).*$/gm;
const INTERRUPT = /^\[Request interrupted by user[^\]]*\]$/;

function cleanPrompt(text: string): string {
  return text
    .replace(REMINDER, '')
    .replace(COMMAND_WRAPPER, '')
    .replace(HOOK_LINE, '')
    .split('\n')
    .filter((l) => !INTERRUPT.test(l.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b: Json) => b?.type === 'text' && typeof b.text === 'string')
    .map((b: Json) => b.text)
    .join('\n');
}

function isToolResult(content: unknown): boolean {
  return Array.isArray(content) && content.some((b: Json) => b?.type === 'tool_result');
}

/** a real human turn, not a tool result and not injected context */
function isHumanPrompt(o: Json): boolean {
  if (o.type !== 'user' || o.isSidechain || o.isMeta) return false;
  if (isToolResult(o.message?.content)) return false;
  if (o.origin && o.origin.kind && o.origin.kind !== 'human') return false;
  return Boolean(cleanPrompt(textOf(o.message?.content)));
}

const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Update']);

/**
 * Classify a tool's file target. Scratch files and dolly's own store are not
 * project work: naming them in the work chain is noise at best, and echoing
 * `.dolly/tasks/…` into a step is circular.
 */
function classifyPath(p: unknown, cwd: string): { rel: string; outside: boolean; store: boolean } {
  if (typeof p !== 'string' || !p) return { rel: '', outside: false, store: false };
  const abs = path.isAbsolute(p) ? p : path.join(cwd, p);
  const rel = path.relative(cwd, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return { rel: '', outside: true, store: false };
  if (rel === '.dolly' || rel.startsWith(`.dolly${path.sep}`)) {
    return { rel, outside: false, store: true };
  }
  return { rel, outside: false, store: false };
}

/**
 * The interesting line of a shell command. Scripts routinely open with `cd`,
 * `set -e` or an export, so the first line is often navigation rather than work.
 */
export function meaningfulCommand(command: unknown): string {
  if (typeof command !== 'string') return '';
  const lines = command.split('\n').map((l) => l.trim()).filter(Boolean);
  const noise = /^(cd|set|export|source|shopt|umask|unset|alias)\b/;
  return lines.find((l) => !noise.test(l)) ?? lines[0] ?? '';
}

function host(url: unknown): string {
  if (typeof url !== 'string') return '';
  return /^https?:\/\/([^/]+)/.exec(url)?.[1] ?? url.slice(0, 40);
}

/**
 * One line describing a single tool call, for the work chain.
 * Returns '' for actions that should not be recorded at all.
 */
function describeTool(name: string, input: Json, cwd: string): string {
  switch (name) {
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit': {
      const t = classifyPath(input.file_path ?? input.notebook_path ?? input.path, cwd);
      if (t.store) return '';
      if (t.outside) return `${name} (outside the project)`;
      return `${name} ${t.rel}`.trim();
    }
    case 'Bash': {
      const cmd = meaningfulCommand(input.command);
      return cmd ? `Bash: ${cmd.slice(0, 90)}` : '';
    }
    case 'Grep':
      return `Grep ${String(input.pattern ?? '').slice(0, 60)}`;
    case 'Glob':
      return `Glob ${String(input.pattern ?? '').slice(0, 60)}`;
    case 'WebFetch':
      return `WebFetch ${host(input.url)}`;
    case 'WebSearch':
      return `WebSearch ${String(input.query ?? '').slice(0, 60)}`;
    case 'Task':
    case 'Agent':
      return `Agent ${input.subagent_type ?? ''} ${input.description ?? ''}`.trim();
    default:
      return name;
  }
}

/** collapse runs of identical actions: Read a, Read a, Read a -> Read a ×3 */
function compressChain(chain: string[], max = 60): string[] {
  const out: string[] = [];
  let last = '';
  let run = 0;
  const flush = () => {
    if (!last) return;
    out.push(run > 1 ? `${last} ×${run}` : last);
  };
  for (const item of chain) {
    if (item === last) {
      run++;
      continue;
    }
    flush();
    last = item;
    run = 1;
  }
  flush();
  if (out.length <= max) return out;
  return [...out.slice(0, max), `… +${out.length - max} more actions`];
}

/**
 * Strip markdown scaffolding so the first real sentence of an assistant message
 * can serve as a step summary.
 */
export function proseOf(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^[#>|\-*+\d]/.test(l) && !/^!\[/.test(l))
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function relFile(p: string, cwd: string): string | null {
  if (typeof p !== 'string' || !p) return null;
  const abs = path.isAbsolute(p) ? p : path.join(cwd, p);
  const rel = path.relative(cwd, abs);
  // ignore scratchpads, temp files and dolly's own store
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  if (rel.startsWith('.dolly/') || rel === '.dolly') return null;
  return rel;
}

/**
 * The opencode plugin mirrors one finished turn per JSONL line, already in the
 * Segment shape — there is nothing to reconstruct beyond validation.
 */
function parseOpencodeMirror(ref: SessionRef): Transcript {
  const raw = readTextOr(ref.file);
  const segments: Segment[] = [];
  for (const line of raw.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try {
      const o = JSON.parse(s) as Partial<Segment>;
      if (!o || typeof o.prompt !== 'string' || !o.uuid) continue;
      segments.push({
        index: segments.length + 1,
        uuid: String(o.uuid),
        at: String(o.at ?? ''),
        endedAt: String(o.endedAt ?? o.at ?? ''),
        prompt: o.prompt,
        files: Array.isArray(o.files) ? o.files.map(String) : [],
        commands: Array.isArray(o.commands) ? o.commands.map(String) : [],
        tools: o.tools && typeof o.tools === 'object' ? (o.tools as Record<string, number>) : {},
        assistantTexts: Array.isArray(o.assistantTexts) ? o.assistantTexts.map(String) : [],
        workChain: Array.isArray(o.workChain) ? o.workChain.map(String) : [],
        thinking: [],
        sidechains: 0,
      });
    } catch {
      /* a partially flushed last line is normal while a session is live */
    }
  }

  const tools: Record<string, number> = {};
  for (const s of segments) {
    for (const [k, v] of Object.entries(s.tools)) tools[k] = (tools[k] ?? 0) + v;
  }
  const first = segments[0];
  const last = segments[segments.length - 1];
  return {
    sessionId: ref.sessionId,
    file: ref.file,
    cwd: process.cwd(),
    branch: '',
    title: firstLine(first?.prompt ?? '') || 'Imported opencode session',
    slug: '',
    startedAt: first?.at ?? '',
    endedAt: last?.endedAt ?? '',
    segments,
    tools,
    skipped: 0,
  };
}

export function parseTranscript(ref: SessionRef, opts: ParseOpts = {}): Transcript {
  if (ref.kind === 'opencode') return parseOpencodeMirror(ref);
  const raw = readTextOr(ref.file);
  const objs: Json[] = [];
  for (const line of raw.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try {
      objs.push(JSON.parse(s));
    } catch {
      /* a partially flushed last line is normal while a session is live */
    }
  }

  const meta = objs.find((o) => o.cwd) ?? {};
  const cwd: string = meta.cwd ?? process.cwd();
  const aiTitle = [...objs].reverse().find((o) => o.type === 'ai-title')?.aiTitle;
  const slug = objs.find((o) => o.slug)?.slug ?? '';

  const segments: Segment[] = [];
  const tools: Record<string, number> = {};
  let skipped = 0;
  let cur: Segment | null = null;

  const push = () => {
    if (cur) segments.push(cur);
  };

  for (const o of objs) {
    if (o.isSidechain) {
      if (cur && o.type === 'assistant') cur.sidechains++;
      continue;
    }
    const stamp: string = o.timestamp ?? '';

    if (isHumanPrompt(o)) {
      const prompt = cleanPrompt(textOf(o.message?.content));
      // an interrupted-then-resubmitted prompt shows up twice; keep the later one
      if (cur && !cur.files.length && !cur.commands.length && sameIntent(cur.prompt, prompt)) {
        skipped++;
        cur.uuid = o.uuid ?? cur.uuid;
        cur.at = stamp || cur.at;
        cur.prompt = prompt.length >= cur.prompt.length ? prompt : cur.prompt;
        continue;
      }
      push();
      cur = {
        index: segments.length + 1,
        uuid: o.uuid ?? `seg-${segments.length + 1}`,
        at: stamp,
        endedAt: stamp,
        prompt,
        files: [],
        commands: [],
        tools: {},
        assistantTexts: [],
        workChain: [],
        thinking: [],
        sidechains: 0,
      };
      continue;
    }

    if (o.type !== 'assistant' || !cur) continue;
    if (stamp) cur.endedAt = stamp;

    for (const b of (o.message?.content ?? []) as Json[]) {
      if (b?.type === 'thinking') {
        if (opts.includeThinking && typeof b.thinking === 'string' && b.thinking.trim()) {
          cur.thinking.push(b.thinking.trim());
        }
        continue;
      }
      if (b?.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
        cur.assistantTexts.push(b.text.trim());
        continue;
      }
      if (b?.type !== 'tool_use') continue;
      const name = String(b.name ?? 'tool');
      cur.tools[name] = (cur.tools[name] ?? 0) + 1;
      tools[name] = (tools[name] ?? 0) + 1;
      const input: Json = b.input ?? {};
      const action = describeTool(name, input, cwd);
      if (action) cur.workChain.push(action);
      if (FILE_TOOLS.has(name)) {
        const rel = relFile(input.file_path ?? input.path ?? input.notebook_path, cwd);
        if (rel && !cur.files.includes(rel)) cur.files.push(rel);
      }
      if (name === 'Bash') {
        const cmd = meaningfulCommand(input.command).slice(0, 160);
        if (cmd && !cur.commands.includes(cmd)) cur.commands.push(cmd);
      }
    }
  }
  push();
  for (const s of segments) s.workChain = compressChain(s.workChain);

  const first = segments[0];
  const last = segments[segments.length - 1];
  return {
    sessionId: ref.sessionId,
    file: ref.file,
    cwd,
    branch: meta.gitBranch ?? '',
    title: aiTitle || firstLine(first?.prompt ?? '') || slug || 'Imported session',
    slug,
    startedAt: first?.at ?? '',
    endedAt: last?.endedAt ?? '',
    segments,
    tools,
    skipped,
  };
}

/** two prompts count as the same intent when one is a prefix of the other */
function sameIntent(a: string, b: string): boolean {
  const x = a.trim();
  const y = b.trim();
  if (!x || !y) return false;
  return x.startsWith(y.slice(0, 40)) || y.startsWith(x.slice(0, 40));
}

export function firstLine(text: string, max = 180): string {
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return '';
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

export function toolSummary(tools: Record<string, number>): string {
  const entries = Object.entries(tools).sort((a, b) => b[1] - a[1]);
  return entries.length ? entries.map(([k, v]) => `${k} ${v}`).join(', ') : 'none';
}
