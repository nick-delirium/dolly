/**
 * Repo-level memory: what is true about this codebase, as opposed to what one
 * task is doing.
 *
 * Without it every task reads as a greenfield project — the agent re-derives the
 * architecture, reinvents conventions, and may violate an invariant that was
 * established three tasks ago. `.dolly/project.md` is where that knowledge
 * accumulates, written by agents as they learn it.
 *
 * This is NOT a second CLAUDE.md. CLAUDE.md tells an agent how to behave;
 * project.md records what is true about the code. One is instructions, the other
 * is findings.
 */
import path from 'node:path';
import { isDir, exists, readTextOr, writeText } from './fsx.js';
import { getSection, sectionNames, setSection, TBD_LINE } from './md.js';
import type { Store } from './store.js';

export const PROJECT_SECTIONS = [
  'Overview',
  'Architecture',
  'Conventions',
  'Invariants',
  'Glossary',
] as const;

const PROMPTS: Record<string, string> = {
  Overview: 'What this repo is, who uses it, what it must not stop doing.',
  Architecture: 'The handful of moving parts and how they connect. Entry points, boundaries.',
  Conventions: 'How code here is written: patterns to follow, patterns banned, and why.',
  Invariants: 'Things that must stay true. Break one and something silently rots.',
  Glossary: 'Domain words that mean something specific here.',
};

export function projectFile(store: Store): string {
  return path.join(store.root, 'project.md');
}

export function readProject(store: Store): string {
  return readTextOr(projectFile(store));
}

export function projectTemplate(store: Store): string {
  const out = [
    '<!-- dolly project brief · repo-level knowledge, maintained by agents -->',
    `# Project brief — ${path.basename(store.project)}`,
    '',
    '> What is true about this codebase. Task-independent.',
    '> Agents: read this before planning. Correct it when you find it wrong —',
    '> a stale brief is worse than none.',
    '',
  ];
  for (const name of PROJECT_SECTIONS) {
    out.push(`## ${name}`, '', `<!-- ask: ${PROMPTS[name]} -->`, '', '_TBD_', '');
  }
  return out.join('\n');
}

export function ensureProject(store: Store): string {
  const file = projectFile(store);
  if (!exists(file)) writeText(file, projectTemplate(store));
  return file;
}

export function setProjectSection(store: Store, section: string, text: string): void {
  const src = readProject(store) || projectTemplate(store);
  const known = sectionNames(src);
  const match = known.find((n) => n.toLowerCase() === section.toLowerCase());
  writeText(projectFile(store), setSection(src, match ?? section, text.trim()));
}


function isFilled(body: string | null): boolean {
  if (!body) return false;
  const lines = body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('<!--'))
    .map((l) => l.replace(/^[-*]\s+/, '').trim())
    .filter(Boolean);
  return lines.length > 0 && !lines.every((l) => TBD_LINE.test(l));
}

export interface ProjectStatus {
  exists: boolean;
  filled: string[];
  missing: string[];
  prompts: Record<string, string>;
}

export function projectStatus(store: Store): ProjectStatus {
  const src = readProject(store);
  if (!src) {
    return { exists: false, filled: [], missing: [...PROJECT_SECTIONS], prompts: PROMPTS };
  }
  const filled: string[] = [];
  const missing: string[] = [];
  for (const name of PROJECT_SECTIONS) {
    (isFilled(getSection(src, name)) ? filled : missing).push(name);
  }
  return { exists: true, filled, missing, prompts: PROMPTS };
}

export interface DigestOpts {
  /** only these sections, in this order; the rest are named in a pointer line */
  sections?: readonly string[];
  /** per-section cap, cut at a line boundary; 0 = none */
  maxPerSection?: number;
}

/**
 * The brief with interview prompts and unfilled sections stripped, for
 * injection. Cut per SECTION at line boundaries: one cap over the whole text
 * stopped mid-word inside Architecture, and Invariants — the part a change must
 * not break — never made it into any context at all.
 */
export function projectDigest(store: Store, opts: DigestOpts = {}): string {
  const src = readProject(store);
  if (!src) return '';
  const filled: string[] = PROJECT_SECTIONS.filter((name) => isFilled(getSection(src, name)));
  const chosen = opts.sections ? opts.sections.filter((n) => filled.includes(n)) : filled;
  const out: string[] = [];
  for (const name of chosen) {
    const clean = (getSection(src, name) ?? '')
      .split('\n')
      .filter((l) => !/^<!--\s*ask:/.test(l.trim()))
      .join('\n')
      .trim();
    out.push(`### ${name}`, '', clip(clean, opts.maxPerSection ?? 0), '');
  }
  const rest = filled.filter((n) => !chosen.includes(n));
  if (rest.length) out.push(`_Also in the brief: ${rest.join(', ')} — \`dolly project\`._`);
  return out.join('\n').trim();
}

/** whole lines up to `max` chars, marked when anything was cut */
function clip(text: string, max: number): string {
  if (!max || text.length <= max) return text;
  const lines = text.split('\n');
  const kept: string[] = [];
  let n = 0;
  for (const l of lines) {
    if (n + l.length > max && kept.length) break;
    kept.push(l);
    n += l.length + 1;
  }
  return `${kept.join('\n')}\n_… cut — \`dolly project\` has the rest_`;
}

/* ------------------------------- code maps -------------------------------- */

export interface CodeMap {
  name: string;
  marker: string;
  hint: string;
}

/**
 * dolly does not index code — graft and CodeGraph already do it well, and a
 * half-built third one would just be wrong more often. What dolly can do is
 * notice one is present and tell the agent to use it before reaching for grep.
 */
const CODE_MAPS: CodeMap[] = [
  {
    name: 'CodeGraph',
    marker: '.codegraph',
    hint: '`codegraph explore "<question>"` returns the relevant symbols\' source plus the call paths between them, including dynamic dispatch grep cannot follow.',
  },
  {
    name: 'graft',
    marker: 'graft/.graph',
    hint: '`graft ask "<task>"` ranks the nodes and file:line worth reading; `graft skeleton <file>` for an API surface.',
  },
  {
    name: 'Serena',
    marker: '.serena',
    hint: 'Serena\'s symbolic tools resolve definitions and references without reading whole files.',
  },
];

export function detectCodeMaps(project: string): CodeMap[] {
  return CODE_MAPS.filter((m) => isDir(path.join(project, m.marker)));
}

export function codeMapLine(project: string): string {
  const found = detectCodeMaps(project);
  if (!found.length) return '';
  return found.map((m) => `${m.name} — ${m.hint}`).join('\n');
}

export { PROMPTS as PROJECT_PROMPTS };
