/**
 * Minimal frontmatter + markdown-section toolkit.
 *
 * Only the YAML subset dolly writes is supported: flat `key: scalar`,
 * inline arrays `key: [a, b]`, and block arrays. That keeps task.md
 * hand-editable without dragging in a YAML dependency.
 */

export type Scalar = string | number | boolean | null;
export type Front = Record<string, Scalar | Scalar[]>;

const FM_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/;

export function parseFrontmatter(src: string): { front: Front; body: string } {
  const m = FM_RE.exec(src);
  if (!m) return { front: {}, body: src };
  return { front: parseYamlish(m[1]), body: src.slice(m[0].length) };
}

function parseYamlish(text: string): Front {
  const out: Front = {};
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith('#')) {
      i++;
      continue;
    }
    const m = /^([A-Za-z0-9_.-]+):[ \t]*(.*)$/.exec(line);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1];
    const raw = m[2].trim();
    if (raw === '') {
      const items: Scalar[] = [];
      let j = i + 1;
      while (j < lines.length && /^[ \t]*-[ \t]+/.test(lines[j])) {
        items.push(scalar(lines[j].replace(/^[ \t]*-[ \t]+/, '').trim()));
        j++;
      }
      if (items.length) {
        out[key] = items;
        i = j;
        continue;
      }
      out[key] = null;
      i++;
      continue;
    }
    if (raw.startsWith('[') && raw.endsWith(']')) {
      const inner = raw.slice(1, -1).trim();
      out[key] = inner ? splitList(inner).map(scalar) : [];
      i++;
      continue;
    }
    out[key] = scalar(raw);
    i++;
  }
  return out;
}

/**
 * Split an inline array on top-level commas. Items keep their quotes so
 * `scalar` can tell `"null"` (a string) from `null`, and escapes inside a
 * double-quoted item never end it early.
 */
function splitList(s: string): string[] {
  const out: string[] = [];
  let buf = '';
  let quote = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      buf += ch;
      if (quote === '"' && ch === '\\' && i + 1 < s.length) buf += s[++i];
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    if (ch === ',') {
      out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

const UNESCAPE: Record<string, string> = { n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\' };

function scalar(raw: string): Scalar {
  const v = raw;
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    // inverse of emitScalar — without it every save doubled the backslashes
    return v.slice(1, -1).replace(/\\(.)/g, (m, c: string) => UNESCAPE[c] ?? m);
  }
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) {
    return v.slice(1, -1).replace(/''/g, "'");
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~' || v === '') return null;
  // never coerce ids like "0001" — round-trip must be lossless
  if (/^-?\d+(\.\d+)?$/.test(v) && String(Number(v)) === v) return Number(v);
  return v;
}

const NEEDS_QUOTE = /^[\s>|&*!%@`{[]|[:#]\s|["'\\\n\r\t]|[\s]$|^$/;
/** inside `[a, b]` a comma or bracket would split or end the list */
const NEEDS_QUOTE_IN_LIST = /[,[\]]/;

function emitScalar(v: Scalar, inList = false): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (
    NEEDS_QUOTE.test(v) ||
    (inList && NEEDS_QUOTE_IN_LIST.test(v)) ||
    /^(true|false|null|~)$/.test(v) ||
    /^-?\d+(\.\d+)?$/.test(v)
  ) {
    const esc = v
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
    return `"${esc}"`;
  }
  return v;
}

export function stringifyFrontmatter(front: Front): string {
  const lines: string[] = ['---'];
  for (const [k, v] of Object.entries(front)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) lines.push(`${k}: [${v.map((x) => emitScalar(x, true)).join(', ')}]`);
    else lines.push(`${k}: ${emitScalar(v)}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

/**
 * A placeholder line: `_TBD_`, `todo`, `???`, `n/a?`. One definition for the
 * plan gate and the project brief, so a line that blocks one never passes the
 * other.
 */
export const TBD_LINE = /^_?\s*(tbd|todo|\?+|n\/a\s*\?)\s*_?$/i;

/* ------------------------------- sections -------------------------------- */

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface Range {
  /** index of the `## Heading` line */
  headStart: number;
  /** index just after the heading line (start of the section body) */
  bodyStart: number;
  /** index of the next `## ` heading, or end of string */
  end: number;
}

function sectionRange(body: string, name: string): Range | null {
  const re = new RegExp(`^##[ \\t]+${escapeRe(name)}[ \\t]*$`, 'mi');
  const m = re.exec(body);
  if (!m) return null;
  const bodyStart = m.index + m[0].length;
  const rest = body.slice(bodyStart);
  const next = /^##[ \t]+/m.exec(rest);
  return {
    headStart: m.index,
    bodyStart,
    end: next ? bodyStart + next.index : body.length,
  };
}

/**
 * How many `## Name` headings the document has.
 *
 * Section lookup takes the first match, so a duplicate means writes land in the
 * wrong place — a spec whose prose contains `## Log` swallowed the step log
 * silently. Callers that manage a section use this to fail loudly instead.
 */
export function countSections(body: string, name: string): number {
  const re = new RegExp(`^##[ \\t]+${escapeRe(name)}[ \\t]*$`, 'gmi');
  return [...body.matchAll(re)].length;
}

export function getSection(body: string, name: string): string | null {
  const r = sectionRange(body, name);
  if (!r) return null;
  return body.slice(r.bodyStart, r.end).trim();
}

/**
 * Push `## ` lines in user content down a level. Sections end at the next `## `
 * heading, so a spec whose prose had its own `## Notes` was silently cut at that
 * line on read, and left an orphan section behind on the next write.
 */
export function demoteHeadings(text: string): string {
  return text.replace(/^##([ \t]+)/gm, '###$1');
}

/** replace a section's body; creates the section at the end when absent */
export function setSection(body: string, name: string, content: string): string {
  const text = demoteHeadings(content.trim());
  const r = sectionRange(body, name);
  if (!r) {
    const sep = body.endsWith('\n\n') ? '' : body.endsWith('\n') ? '\n' : '\n\n';
    return `${body}${sep}## ${name}\n\n${text}\n`;
  }
  return `${body.slice(0, r.bodyStart)}\n\n${text}\n\n${body.slice(r.end)}`;
}

/**
 * Append to a section. `tight` joins with a single newline so consecutive log
 * lines stay one markdown list instead of becoming a loose, double-spaced one.
 */
export function appendToSection(
  body: string,
  name: string,
  content: string,
  tight = false,
): string {
  const current = getSection(body, name) ?? '';
  const placeholder = /^_[^\n]*_$/.test(current.trim());
  const base = placeholder || !current ? '' : `${current}${tight ? '\n' : '\n\n'}`;
  return setSection(body, name, `${base}${content.trim()}`);
}

/** list of level-2 section names, in document order */
export function sectionNames(body: string): string[] {
  return [...body.matchAll(/^##[ \t]+(.+?)[ \t]*$/gm)].map((m) => m[1]);
}

/* ------------------------- marker-delimited blocks ------------------------ */

export function blockMarkers(id: string): { start: string; end: string } {
  return { start: `<!-- dolly:${id} -->`, end: `<!-- /dolly:${id} -->` };
}

/**
 * Neutralise marker-shaped sequences inside block content.
 *
 * Content can be arbitrary text — a transcript import, a user's spec, an
 * assistant message that happens to quote dolly's own markers. Left alone, a
 * quoted `<!-- /dolly:step 0003 -->` would terminate the enclosing block early
 * and silently truncate everything after it. `&lt;!--` still reads as `<!--`
 * once rendered, so nothing is lost visually.
 */
export function neutralizeMarkers(text: string): string {
  return text.replace(/<!--(\s*\/?\s*dolly:)/g, '&lt;!--$1');
}

/**
 * Where a block sits: start marker, and the first end marker AFTER it. `end` is
 * -1 when the start has no partner — a hand-deleted end marker, which must never
 * be "repaired" by guessing where the block stopped.
 */
function blockRange(src: string, id: string): { start: number; end: number } | null {
  const { start, end } = blockMarkers(id);
  const i = src.indexOf(start);
  if (i === -1) return null;
  return { start: i, end: src.indexOf(end, i + start.length) };
}

/** replace (or insert) a `<!-- dolly:id -->…<!-- /dolly:id -->` block */
export function setBlock(src: string, id: string, content: string): string {
  const { start, end } = blockMarkers(id);
  const wrapped = `${start}\n${neutralizeMarkers(content.trim())}\n${end}`;
  const r = blockRange(src, id);
  if (r && r.end === -1) {
    // appending a second block here made the NEXT write replace everything from
    // the orphan start to the new end — user content in between included
    throw new Error(`found "${start}" with no matching "${end}" after it — restore the end marker by hand, then retry`);
  }
  if (r) return src.slice(0, r.start) + wrapped + src.slice(r.end + end.length);
  const sep = src === '' ? '' : src.endsWith('\n\n') ? '' : src.endsWith('\n') ? '\n' : '\n\n';
  return `${src}${sep}${wrapped}\n`;
}

export function getBlock(src: string, id: string): string | null {
  const { start } = blockMarkers(id);
  const r = blockRange(src, id);
  if (!r || r.end === -1) return null;
  return src.slice(r.start + start.length, r.end).trim();
}

/** append a fresh block at the end of the document */
export function appendBlock(src: string, id: string, content: string): string {
  const { start, end } = blockMarkers(id);
  const sep = src === '' ? '' : src.endsWith('\n\n') ? '' : src.endsWith('\n') ? '\n' : '\n\n';
  return `${src}${sep}${start}\n${neutralizeMarkers(content.trim())}\n${end}\n`;
}

export function removeBlock(src: string, id: string): string {
  const { end } = blockMarkers(id);
  const r = blockRange(src, id);
  if (!r || r.end === -1) return src;
  // swallow the blank line the block left behind
  return `${src.slice(0, r.start).replace(/\n{2,}$/, '\n\n')}${src.slice(r.end + end.length).replace(/^\n+/, '')}`;
}

/**
 * Ids of every `<!-- dolly:<prefix> <id> -->` block, in document order.
 * Used to walk the step entries inside a single steps.md.
 */
export function listBlocks(src: string, prefix: string): string[] {
  const out: string[] = [];
  for (const b of allBlocks(src, prefix)) if (!out.includes(b.id)) out.push(b.id);
  return out;
}

/**
 * Every `<!-- dolly:<prefix> <id> -->` block with its content, in document
 * order — duplicates included. Two blocks with one id (a merge of two branches
 * that each logged step N) must both stay readable, not collapse to the first.
 */
export function allBlocks(src: string, prefix: string): { id: string; text: string }[] {
  const re = new RegExp(`<!--\\s*dolly:${escapeRe(prefix)}[ \\t]+([^\\s>]+)[ \\t]*-->`, 'g');
  const out: { id: string; text: string }[] = [];
  for (const m of src.matchAll(re)) {
    const from = m.index! + m[0].length;
    const close = src.indexOf(`<!-- /dolly:${prefix} ${m[1]} -->`, from);
    if (close === -1) continue;
    out.push({ id: m[1], text: src.slice(from, close).trim() });
  }
  return out;
}
