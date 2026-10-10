// What the collector alone can say about a project's parts: one per top-level folder (descending a level
// when one folder holds most of the code), each part's numbers from the folder totals, and a status
// worked out from them. Labelled "inferred": only a person or Claude can say a part is stuck.

import { partOfPath, topFolder } from './paths.js';
import { emptyMetrics, type Evidence, type Facts, type Part, type PartMetrics, type Status } from './schema.js';

/** The most parts inferred from folders; the rest fall into the catch-all. */
export const INFERRED_MAX = 8;
/** A folder holding more than this share of the lines is split into its own subfolders. */
const DESCEND_SHARE = 0.6;
/** Commits this recent, or uncommitted changes, make a part in progress. */
export const RECENT_DAYS = 14;
/** Fewer lines than this is a part not started. */
export const STARTED_LINES = 50;

export type PartShape = Pick<Part, 'id' | 'name' | 'summary' | 'paths'>;

/** The parts the folders suggest: the biggest folders by lines, and "Everything else" for the rest. */
export function inferParts(facts: Facts): PartShape[] {
  const dirs = facts.files.dirs;
  const total = dirs.reduce((a, d) => a + d.lines, 0);
  const folderLines = new Map<string, number>();
  for (const d of dirs) if (d.path) folderLines.set(topFolder(`${d.path}/x`), (folderLines.get(topFolder(`${d.path}/x`)) ?? 0) + d.lines);
  let folders = [...folderLines.entries()].map(([path, lines]) => ({ path, lines }));
  folders.sort((a, b) => b.lines - a.lines);
  const big = folders[0];
  if (big && total > 0 && big.lines / total > DESCEND_SHARE) {
    const subs = new Map<string, number>();
    for (const d of dirs) {
      const segs = d.path.split('/');
      if (segs[0] !== big.path || segs.length < 2) continue;
      const key = `${segs[0]}/${segs[1]}`;
      subs.set(key, (subs.get(key) ?? 0) + d.lines);
    }
    if (subs.size > 1) folders = [...folders.slice(1), ...[...subs.entries()].map(([path, lines]) => ({ path, lines }))].sort((a, b) => b.lines - a.lines);
  }
  const top = folders.filter((f) => f.lines > 0 || folders.length <= INFERRED_MAX).slice(0, INFERRED_MAX);
  const parts: PartShape[] = top.map((f) => ({ id: idOf(f.path), name: f.path, summary: summaryOf(facts, f.path), paths: [`${f.path}/**`] }));
  const covered = top.reduce((a, f) => a + f.lines, 0);
  const rootFiles = dirs.some((d) => d.path === '' && d.files > 0);
  if (rootFiles || covered < total) parts.push({ id: 'rest', name: 'Everything else', summary: 'Files at the top and the smaller folders', paths: ['*'] });
  return parts;
}

const idOf = (path: string) =>
  path
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'root';

function summaryOf(facts: Facts, path: string): string {
  const top = facts.files.byTopFolder.find((f) => f.folder === topFolder(`${path}/x`));
  const lang = top ? Object.entries(top.languages).sort((a, b) => b[1] - a[1])[0]?.[0] : undefined;
  const files = facts.files.dirs.filter((d) => d.path === path || d.path.startsWith(`${path}/`)).reduce((a, d) => a + d.files, 0);
  return `${files} file${files === 1 ? '' : 's'}${lang ? `, mostly ${lang}` : ''}`;
}

/** Each part's numbers, from the folder totals: every folder counts toward the most specific part covering it. */
export function partMetrics(parts: readonly Pick<Part, 'id' | 'paths'>[], facts: Facts): Map<string, PartMetrics> {
  const out = new Map(parts.map((p) => [p.id, emptyMetrics()]));
  for (const d of facts.files.dirs) {
    const id = partOfPath(parts, d.path);
    const m = id ? out.get(id) : undefined;
    if (!m) continue;
    m.lines += d.lines;
    m.files += d.files;
    m.testFiles += d.tests;
    m.todo += d.todo;
    m.fixme += d.fixme;
    m.commits30d += d.commits30d;
    if (d.lastCommit && (!m.lastCommit || d.lastCommit > m.lastCommit)) m.lastCommit = d.lastCommit;
  }
  for (const p of facts.git?.uncommitted.paths ?? []) {
    const id = partOfPath(parts, p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
    const m = id ? out.get(id) : undefined;
    if (m) m.uncommitted++;
  }
  return out;
}

/** The ids of the parts a commit's files belong to. */
export function commitParts(parts: readonly Pick<Part, 'id' | 'paths'>[], paths: readonly string[]): string[] {
  const ids = new Set<string>();
  for (const p of paths) {
    const id = partOfPath(parts, p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
    if (id) ids.add(id);
  }
  return [...ids];
}

/** In progress (changes or recent commits), not started (almost nothing there), else done. Never stuck. */
export function inferStatus(m: PartMetrics, now: Date): { status: Status; evidence: Evidence[] } {
  const recent = m.lastCommit ? now.getTime() - Date.parse(m.lastCommit) < RECENT_DAYS * 86_400_000 : false;
  if (m.uncommitted > 0 || recent) {
    const evidence: Evidence[] = [];
    if (m.uncommitted) evidence.push({ kind: 'note', ref: 'uncommitted', text: `${m.uncommitted} uncommitted file${m.uncommitted === 1 ? '' : 's'}` });
    if (recent) evidence.push({ kind: 'commit', ref: m.lastCommit!, text: `${m.commits30d} commit${m.commits30d === 1 ? '' : 's'} in 30 days, the last ${m.lastCommit!.slice(0, 10)}` });
    return { status: 'in-progress', evidence };
  }
  if (m.lines < STARTED_LINES) return { status: 'not-started', evidence: [{ kind: 'note', ref: 'lines', text: `${m.lines} ${m.lines === 1 ? 'line' : 'lines'} so far` }] };
  return { status: 'done', evidence: [{ kind: 'note', ref: 'quiet', text: `No changes in ${RECENT_DAYS} days${m.lastCommit ? `; last commit ${m.lastCommit.slice(0, 10)}` : ''}` }] };
}
