/**
 * `dolly reindex` — attach dolly to a conversation that is already running,
 * or re-derive an imported task after the store format changes.
 *
 * Two-phase, like planning: the CLI extracts facts (turn boundaries, verbatim
 * requests, files touched, commands run) and the agent — which has the actual
 * conversation in context — turns them into a spec. `--apply` does the
 * mechanical import so nothing is lost if the agent never gets that far.
 */
import { readTextOr, writeText } from './core/fsx.js';
import { listBlocks, removeBlock } from './core/md.js';
import type { Store } from './core/store.js';
import {
  addStep,
  createTask,
  linkSession,
  reload,
  saveTask,
  setStatus,
  stepsFile,
  type StepEntry,
} from './core/task.js';
import { stepEntries } from './core/task.js';
import {
  firstLine,
  parseTranscript,
  proseOf,
  resolveSession,
  toolSummary,
  type Segment,
  type Transcript,
} from './core/transcript.js';
import type { Task } from './core/types.js';

export interface ReindexOpts {
  session?: string;
  file?: string;
  /** keep every segment, including ones that touched no files */
  allTurns?: boolean;
  /** only the last N segments */
  limit?: number;
  into?: string;
  title?: string;
  status?: string;
  apply?: boolean;
  /** drop previously imported steps for this session and import again */
  rebuild?: boolean;
  /** capture raw reasoning blocks — verbose, off unless asked */
  includeThinking?: boolean;
  /**
   * Only import segments that started after this timestamp. Used by auto-logging
   * so a turn the agent already logged itself is never duplicated.
   */
  onlyNewerThan?: string;
}

export function loadTranscript(cwd: string, opts: ReindexOpts): Transcript {
  return parseTranscript(resolveSession(cwd, opts), { includeThinking: opts.includeThinking });
}

/**
 * Turn ids already present in a task's steps.md, so re-runs stay idempotent.
 * Matches any non-separator token — never assume a uuid shape, transcripts from
 * older or future Claude Code builds may not use one.
 */
export function importedTurns(task: Task): Set<string> {
  const out = new Set<string>();
  for (const e of stepEntries(task.dir)) {
    for (const m of e.text.matchAll(/turn ([^\s·]+)/g)) out.add(m[1]);
  }
  return out;
}

/**
 * Segments worth importing. A prompt that touched no files is usually a
 * clarification, so it folds into the next one rather than becoming a step.
 */
export function selectSegments(t: Transcript, opts: ReindexOpts): Segment[] {
  let segs = t.segments;
  if (!opts.allTurns) {
    const merged: Segment[] = [];
    let carry: string[] = [];
    let carrySeg: Segment | null = null;
    for (const s of segs) {
      const substantive = s.files.length > 0 || s.commands.length > 0;
      if (!substantive) {
        // a clarification belongs to the work it precedes, not to its own step
        carry.push(s.prompt);
        carrySeg = carrySeg ?? s;
        continue;
      }
      merged.push(carry.length ? { ...s, prompt: [...carry, s.prompt].join('\n\n') } : s);
      carry = [];
      carrySeg = null;
    }
    // a trailing request with no work yet is pending, not noise — keep it
    if (carry.length && carrySeg) {
      merged.push({ ...carrySeg, prompt: carry.join('\n\n') });
    }
    segs = merged;
  }
  if (opts.onlyNewerThan) {
    const floor = Date.parse(opts.onlyNewerThan);
    if (Number.isFinite(floor)) segs = segs.filter((s) => Date.parse(s.at) > floor);
  }
  if (opts.limit && opts.limit > 0) segs = segs.slice(-opts.limit);
  return segs;
}

export function renderDigest(
  t: Transcript,
  segs: Segment[],
  imported: Set<string>,
  target: Task | null,
): string {
  const out: string[] = [];
  const short = t.sessionId.slice(0, 8);
  out.push(`# dolly reindex — session ${short}`);
  out.push('');
  out.push(
    [
      `- title (from Claude Code): ${t.title}`,
      `- transcript: ${t.file}`,
      `- cwd: ${t.cwd}${t.branch ? ` · branch: ${t.branch}` : ''}`,
      `- span: ${t.startedAt || '?'} → ${t.endedAt || '?'}`,
      `- human turns: ${t.segments.length}${t.skipped ? ` (+${t.skipped} interrupted/duplicate)` : ''}`,
      `- importable segments: ${segs.length}`,
      `- tools used: ${toolSummary(t.tools)}`,
      target
        ? `- target task: ${target.meta.id} ${target.meta.slug} (${target.meta.status}, ${target.meta.steps} steps)`
        : '- target task: none yet — one will be created',
      `- already imported: ${imported.size} turn(s)`,
    ].join('\n'),
  );

  const fresh = segs.filter((s) => !imported.has(s.uuid));
  if (!fresh.length) {
    out.push('', '_every segment is already imported — nothing to do (use `--rebuild` to redo)._');
  }

  for (const s of segs) {
    out.push('');
    out.push(
      `## Segment ${s.index} · ${s.at}${imported.has(s.uuid) ? ' · **already imported**' : ''}`,
    );
    out.push('');
    out.push(`turn \`${s.uuid}\``);
    out.push('');
    out.push('### What the agent reported');
    out.push('');
    out.push(
      s.assistantTexts.length
        ? quote(clip(s.assistantTexts[s.assistantTexts.length - 1], 1200))
        : '_no visible message — the turn was all tool calls_',
    );
    if (s.workChain.length) {
      out.push('', `### Work chain (${s.workChain.length} actions)`, '');
      out.push(s.workChain.map((a) => `- ${a}`).join('\n'));
    }
    if (s.files.length) {
      out.push('', `### Files touched (${s.files.length})`, '');
      out.push(s.files.map((f) => `- \`${f}\``).join('\n'));
    }
    out.push('', `### Tools: ${toolSummary(s.tools)}${s.sidechains ? ` · ${s.sidechains} subagent turn(s)` : ''}`);
    out.push('', '### Request that opened the turn', '');
    out.push(quote(clip(s.prompt || '_(no text)_', 700)));
  }

  out.push('', '---', '');
  out.push('## Next');
  out.push('');
  if (fresh.length) {
    out.push(
      `Import the mechanical facts: \`dolly reindex --apply${target ? ` --into ${target.meta.id}` : ''}\``,
      '',
      'Then replace the imported spec with a real one — you have the conversation in context, the transcript does not know what matters:',
      '',
      '```',
      'dolly spec <ref> --short "<2-5 lines>" --file <full-spec.md> --reason "reindexed from session ' +
        short +
        '"',
      '```',
      '',
      'Rewrite any imported step summary that reads like a raw request rather than an outcome, by logging a corrective step — imported steps are history, not drafts.',
    );
  } else {
    out.push('Nothing to import. `--rebuild` re-imports this session from scratch.');
  }
  return out.join('\n');
}

function quote(text: string): string {
  return text
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n');
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}\n> …` : text;
}

export interface ApplyResult {
  task: Task;
  created: boolean;
  imported: number;
  skipped: number;
  rebuilt: number;
}

export function applyReindex(store: Store, t: Transcript, opts: ReindexOpts): ApplyResult {
  const segs = selectSegments(t, opts);
  let task: Task;
  let created = false;

  if (opts.into) {
    task = store.resolve(opts.into, false);
  } else {
    const existing = findImportedTask(store, t.sessionId);
    if (existing) {
      task = existing;
    } else {
      task = createTask(store, {
        title: opts.title ?? t.title,
        status: opts.status ?? 'working',
        specShort: importedShortSpec(t),
        specFull: importedFullSpec(t),
      });
      created = true;
    }
  }

  linkSession(task, t.sessionId);
  saveTask(task);

  let rebuilt = 0;
  if (opts.rebuild) rebuilt = dropImported(task, t.sessionId);

  const imported = importedTurns(task);
  let count = 0;
  let skipped = 0;

  for (const s of segs) {
    if (imported.has(s.uuid)) {
      skipped++;
      continue;
    }
    task = reload(store, task);
    addStep(store, task, {
      summary: stepSummary(s),
      files: s.files,
      detail: stepDetail(t, s),
      source: `session ${t.sessionId} · turn ${s.uuid}`,
    });
    count++;
  }

  if (opts.status && task.meta.status !== opts.status) {
    task = reload(store, task);
    setStatus(store, task, opts.status, `reindexed from session ${t.sessionId.slice(0, 8)}`);
  }
  return { task: reload(store, task), created, imported: count, skipped, rebuilt };
}

/** a task that already carries steps from this session */
function findImportedTask(store: Store, sessionId: string): Task | null {
  for (const task of store.loadTasks(false)) {
    const raw = readTextOr(stepsFile(task.dir));
    if (raw.includes(`session ${sessionId}`)) return task;
  }
  return null;
}

function dropImported(task: Task, sessionId: string): number {
  const raw = readTextOr(stepsFile(task.dir));
  if (!raw) return 0;
  const entries: StepEntry[] = stepEntries(task.dir);
  const doomed = entries.filter((e) => e.text.includes(`session ${sessionId}`)).map((e) => e.id);
  if (!doomed.length) return 0;
  let next = raw;
  for (const id of doomed) next = removeBlock(next, `step ${id}`);
  writeText(stepsFile(task.dir), next);

  // The short log is append-only, so the superseded lines stay — but they must
  // not keep pointing at entries that no longer exist, or read as if they were
  // separate work from the re-import that follows.
  for (const id of doomed) {
    task.body = task.body.replace(
      new RegExp(`full: \`steps\\.md#${id}\``, 'g'),
      'full: _superseded by a later re-import_',
    );
  }
  saveTask(task);
  return doomed.length;
}

/**
 * A step summary should say what the agent understood and did — not repeat the
 * request. Preference order: the last thing the agent told the user (that IS its
 * own summary), then the first thing it said, then a description synthesised
 * from the work chain. The request is only a last resort.
 */
function stepSummary(s: Segment): string {
  const prose = s.assistantTexts.map((t) => firstLine(proseOf(t), 220)).filter(Boolean);
  // Prefer the LAST substantial message: that is the agent's own wrap-up. A
  // trailing one-liner ("Now testing this:") is a lead-in, not a summary.
  const substantial = prose.filter((p) => p.length >= 40);
  const pick = substantial[substantial.length - 1] ?? prose[prose.length - 1];
  if (pick && pick.length > 15) return pick;
  const did = describeWork(s);
  if (did) return did;
  const req = firstLine(s.prompt, 150);
  return req ? `asked to: ${req}` : 'work with no visible summary';
}

/** fallback when a turn produced no prose at all: state what it touched */
function describeWork(s: Segment): string {
  const bits: string[] = [];
  if (s.files.length) {
    bits.push(`changed ${s.files.length} file(s): ${s.files.slice(0, 4).join(', ')}`);
  }
  if (s.commands.length) bits.push(`ran ${s.commands.length} command(s)`);
  if (s.sidechains) bits.push(`${s.sidechains} subagent turn(s)`);
  return bits.length ? `No written summary. ${bits.join('; ')}.` : '';
}

/**
 * Ordered so the next agent reads what happened before what was asked: its own
 * predecessor's account first, then the mechanical trace, then the request.
 */
function stepDetail(t: Transcript, s: Segment): string {
  const out: string[] = [];

  out.push('## What the agent said it did', '');
  if (s.assistantTexts.length) {
    // every visible message, oldest first — the running account of the turn
    out.push(s.assistantTexts.map((x) => clip(x, 4000)).join('\n\n---\n\n'));
  } else {
    out.push('_no visible message — the turn was entirely tool calls, see the work chain_');
  }

  if (s.workChain.length) {
    out.push('', '## Work chain', '', s.workChain.map((a) => `- ${a}`).join('\n'));
  }
  if (s.files.length) {
    out.push('', '## Files touched', '', s.files.map((f) => `- \`${f}\``).join('\n'));
  }
  if (s.commands.length) {
    out.push('', '## Commands run', '', s.commands.map((c) => `- \`${c}\``).join('\n'));
  }
  out.push('', '## Tools', '', toolSummary(s.tools) + (s.sidechains ? ` · ${s.sidechains} subagent turn(s)` : ''));

  out.push('', '## Request that opened the turn (verbatim)', '', s.prompt || '_(no text)_');

  if (s.thinking.length) {
    out.push(
      '',
      '## Reasoning (raw, opt-in)',
      '',
      '_Captured because `reindex.includeThinking` is on. Tentative by nature — later statements in the same turn may contradict it._',
      '',
      s.thinking.map((x) => clip(x, 2000)).join('\n\n---\n\n'),
    );
  }

  out.push(
    '',
    '---',
    '',
    `_Imported by \`dolly reindex\` from session ${t.sessionId}, turn ${s.uuid} (${s.at} → ${s.endedAt}). The summary is lifted from what the agent said, not written by a human. Correct it with a follow-up step if it misleads._`,
  );
  return out.join('\n');
}

function importedShortSpec(t: Transcript): string {
  const first = t.segments[0]?.prompt ?? '';
  const lines = first.split('\n').filter(Boolean).slice(0, 4).join('\n');
  return [
    lines || '_no opening request found in the transcript_',
    '',
    `_Imported from Claude Code session ${t.sessionId.slice(0, 8)}. Replace with a written spec: \`dolly spec <ref> --short … --file …\`._`,
  ].join('\n');
}

function importedFullSpec(t: Transcript): string {
  const out: string[] = [`# ${t.title}`, ''];
  out.push(
    `> Reconstructed by \`dolly reindex\` from Claude Code session \`${t.sessionId}\`.`,
    '> The requests below are verbatim; nothing here has been reviewed by a human.',
    '',
  );
  const [first, ...rest] = t.segments;
  if (first) {
    out.push('## Original request', '', first.prompt, '');
  }
  if (rest.length) {
    out.push('## Later direction changes', '');
    for (const s of rest) out.push(`### ${s.at}`, '', s.prompt, '');
  }
  const files = new Set<string>();
  for (const s of t.segments) for (const f of s.files) files.add(f);
  if (files.size) {
    out.push('## Files touched in this session', '', [...files].sort().map((f) => `- \`${f}\``).join('\n'), '');
  }
  return out.join('\n').trim();
}

export { listBlocks };
