// Signal's reading of a map's parts (shared/signal.ts has the rules): the parts by status as one line
// ("8 parts: 3 done, 3 in progress, 1 not started, 1 stuck"), and, for a map the office inferred from
// the code with no /rundown judgement in it, the one next thing worked out from what the map does know.
// Pure, so the page, the office and the tests say the same.

import type { Part, Rundown } from './rundown/schema.js';
import type { PartCounts } from './protocol/signal.js';

/** Parts by status. */
export function partCounts(parts: readonly Pick<Part, 'status'>[]): PartCounts {
  const c: PartCounts = { total: parts.length, done: 0, inProgress: 0, notStarted: 0, stuck: 0 };
  for (const p of parts) {
    if (p.status === 'done') c.done++;
    else if (p.status === 'in-progress') c.inProgress++;
    else if (p.status === 'not-started') c.notStarted++;
    else if (p.status === 'stuck') c.stuck++;
  }
  return c;
}

/** "8 parts: 3 done, 3 in progress, 1 stuck": the statuses no part has are left out. Null with no parts. */
export function partsLine(c: PartCounts | undefined): string | null {
  if (!c || c.total <= 0) return null;
  const each = [
    [c.done, 'done'],
    [c.inProgress, 'in progress'],
    [c.notStarted, 'not started'],
    [c.stuck, 'stuck'],
  ] as const;
  const said = each.filter(([n]) => n > 0).map(([n, w]) => `${n} ${w}`);
  return `${c.total} ${c.total === 1 ? 'part' : 'parts'}${said.length ? `: ${said.join(', ')}` : ''}`;
}

/**
 * The next thing, from a map with no judgement of Claude's: the first open item of the active milestone
 * (the person's milestones.md), else the part with the most uncommitted work, else the part in progress
 * that moved last. Null when nothing is in progress.
 */
export function inferredNext(r: Pick<Rundown, 'parts' | 'milestones' | 'nextMilestone'>): string | null {
  const item = r.milestones.find((m) => m.id === r.nextMilestone)?.items.find((i) => !i.done);
  if (item) return item.text;
  const going = r.parts.filter((p) => p.status === 'in-progress');
  const dirty = [...going].filter((p) => p.metrics.uncommitted > 0).sort((a, b) => b.metrics.uncommitted - a.metrics.uncommitted)[0];
  if (dirty) return `Finish or commit the work in ${dirty.name} (${dirty.metrics.uncommitted} uncommitted ${dirty.metrics.uncommitted === 1 ? 'file' : 'files'})`;
  const last = [...going].filter((p) => p.metrics.lastCommit).sort((a, b) => (b.metrics.lastCommit ?? '').localeCompare(a.metrics.lastCommit ?? ''))[0];
  if (last) return `Carry on with ${last.name} (${last.metrics.commits30d} ${last.metrics.commits30d === 1 ? 'commit' : 'commits'} in 30 days)`;
  return null;
}
