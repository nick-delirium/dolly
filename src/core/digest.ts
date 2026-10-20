/**
 * Digests: one agent-written note for an area several tasks built together —
 * `.dolly/digests/<slug>.md`. Read-side only; `compact.ts` writes them. Kept
 * apart so the board and recall can read digests without pulling in the
 * compaction material builder (and the renderer it uses).
 */
import path from 'node:path';
import { isDir, listFiles, readTextOr } from './fsx.js';
import { getBlock, parseFrontmatter } from './md.js';
import type { Store } from './store.js';

export interface Digest {
  slug: string;
  title: string;
  /** task ids rolled into it */
  covers: string[];
  created: string;
  updated: string;
  by: string;
  /** the current prose */
  body: string;
  file: string;
}

export function digestsDir(store: Store): string {
  return path.join(store.root, 'digests');
}

export function digestFile(store: Store, slug: string): string {
  return path.join(digestsDir(store), `${slug}.md`);
}

export function readDigest(file: string): Digest | null {
  const raw = readTextOr(file);
  if (!raw) return null;
  const { front, body } = parseFrontmatter(raw);
  const slug = String(front.slug ?? path.basename(file, '.md'));
  const covers = Array.isArray(front.covers) ? front.covers.map(String) : [];
  return {
    slug,
    title: String(front.title ?? slug),
    covers,
    created: String(front.created ?? ''),
    updated: String(front.updated ?? front.created ?? ''),
    by: String(front.by ?? ''),
    body: getBlock(body, 'digest') ?? '',
    file,
  };
}

export function listDigests(store: Store): Digest[] {
  const dir = digestsDir(store);
  if (!isDir(dir)) return [];
  return listFiles(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => readDigest(path.join(dir, f)))
    .filter((d): d is Digest => d !== null)
    .sort((a, b) => b.updated.localeCompare(a.updated));
}
