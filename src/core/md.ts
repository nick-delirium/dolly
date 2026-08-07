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

function splitList(s: string): string[] {
  const out: string[] = [];
  let buf = '';
  let quote = '';
  for (const ch of s) {
    if (quote) {
      if (ch === quote) quote = '';
      else buf += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
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

function scalar(raw: string): Scalar {
  let v = raw;
  if (
    (v.startsWith('"') && v.endsWith('"') && v.length >= 2) ||
    (v.startsWith("'") && v.endsWith("'") && v.length >= 2)
  ) {
    return v.slice(1, -1);
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~' || v === '') return null;
  // never coerce ids like "0001" — round-trip must be lossless
  if (/^-?\d+(\.\d+)?$/.test(v) && String(Number(v)) === v) return Number(v);
  return v;
}

const NEEDS_QUOTE = /^[\s>|&*!%@`{[]|[:#]\s|["']|[\s]$|^$/;

function emitScalar(v: Scalar): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (NEEDS_QUOTE.test(v) || /^(true|false|null|~)$/.test(v) || /^-?\d+(\.\d+)?$/.test(v)) {
    return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return v;
}

export function stringifyFrontmatter(front: Front): string {
  const lines: string[] = ['---'];
  for (const [k, v] of Object.entries(front)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) lines.push(`${k}: [${v.map(emitScalar).join(', ')}]`);
    else lines.push(`${k}: ${emitScalar(v)}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

export function withFrontmatter(front: Front, body: string): string {
  return stringifyFrontmatter(front) + (body.startsWith('\n') ? body : `\n${body}`);
}

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

export function hasSection(body: string, name: string): boolean {
  return sectionRange(body, name) !== null;
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

/** replace a section's body; creates the section at the end when absent */
export function setSection(body: string, name: string, content: string): string {
  const text = content.trim();
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

/** replace (or insert) a `<!-- dolly:id -->…<!-- /dolly:id -->` block */
export function setBlock(src: string, id: string, content: string): string {
  const { start, end } = blockMarkers(id);
  const wrapped = `${start}\n${neutralizeMarkers(content.trim())}\n${end}`;
  const i = src.indexOf(start);
  const j = src.indexOf(end);
  if (i !== -1 && j > i) {
    return src.slice(0, i) + wrapped + src.slice(j + end.length);
  }
  const sep = src === '' ? '' : src.endsWith('\n\n') ? '' : src.endsWith('\n') ? '\n' : '\n\n';
  return `${src}${sep}${wrapped}\n`;
}

export function getBlock(src: string, id: string): string | null {
  const { start, end } = blockMarkers(id);
  const i = src.indexOf(start);
  const j = src.indexOf(end);
  if (i === -1 || j <= i) return null;
  return src.slice(i + start.length, j).trim();
}

/** append a fresh block at the end of the document */
export function appendBlock(src: string, id: string, content: string): string {
  const { start, end } = blockMarkers(id);
  const sep = src === '' ? '' : src.endsWith('\n\n') ? '' : src.endsWith('\n') ? '\n' : '\n\n';
  return `${src}${sep}${start}\n${neutralizeMarkers(content.trim())}\n${end}\n`;
}

export function removeBlock(src: string, id: string): string {
  const { start, end } = blockMarkers(id);
  const i = src.indexOf(start);
  const j = src.indexOf(end);
  if (i === -1 || j <= i) return src;
  // swallow the blank line the block left behind
  return `${src.slice(0, i).replace(/\n{2,}$/, '\n\n')}${src.slice(j + end.length).replace(/^\n+/, '')}`;
}

/**
 * Ids of every `<!-- dolly:<prefix> <id> -->` block, in document order.
 * Used to walk the step entries inside a single steps.md.
 */
export function listBlocks(src: string, prefix: string): string[] {
  const re = new RegExp(`<!--\\s*dolly:${escapeRe(prefix)}[ \\t]+([^\\s>]+)[ \\t]*-->`, 'g');
  const out: string[] = [];
  for (const m of src.matchAll(re)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}
