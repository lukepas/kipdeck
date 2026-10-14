// Small helpers the map page and the office's Rundown window share: escaping, counts in words, and a
// part's folders one level under its own paths (the cells in its treemap tile, the drawer's folder list).

import { partOfPath } from './paths.js';
import type { Part, Rundown } from './schema.js';

export const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmt = (n: number) => n.toLocaleString('en-US');
export const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

/** The part's folders one level under its own paths, for the cells inside its tile. */
export function partFolders(r: Rundown, part: Part): { path: string; lines: number }[] {
  const out = new Map<string, number>();
  for (const d of r.facts.files.dirs) {
    if (!d.lines || partOfPath(r.parts, d.path) !== part.id) continue;
    const base = part.paths.map((g) => g.split('/').filter((s) => !/[*?[\]{}]/.test(s)).join('/')).find((b) => !b || d.path === b || d.path.startsWith(`${b}/`)) ?? '';
    const rest = base ? d.path.slice(base.length).replace(/^\//, '') : d.path;
    const key = rest ? `${base ? `${base}/` : ''}${rest.split('/')[0]}` : base || '.';
    out.set(key, (out.get(key) ?? 0) + d.lines);
  }
  return [...out.entries()].map(([path, lines]) => ({ path, lines })).sort((a, b) => b.lines - a.lines);
}
