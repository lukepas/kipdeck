// Commendations: thin chevrons on a unit's shoulder band for a record it really has, and the unit of
// the watch, who stands on the Proof corner's plinth for a day. Every rule is an outcome a person
// caused (a merge, a close, a revert, an attestation); nothing counts activity, and nothing here names
// or ranks a person. The words in this file are checked by tests/copy.test.ts.

import { MIN_SAMPLES } from './reputation.js';
import { dayKey, median, type UnitLog } from './epithet.js';

/** Merges for the first white chevron. */
export const CHEVRON_MERGES = 5;
/** The merge rate (merged over merged and closed unmerged) for the second, with MIN_SAMPLES of them. */
export const CHEVRON_RATE = 0.9;
/** Merges with no revert for the third. */
export const CHEVRON_CLEAN = 10;

export interface Chevrons {
  /** Thin white chevrons, 0 to 3. */
  white: number;
  /** One violet chevron: its agent has an ERC-8004 record on chain (the only violet, as everywhere, is proof). */
  violet: boolean;
  /** What each one is for, in plain words. */
  reasons: string[];
}

/** The chevrons a unit wears for its record (`log`), the reverts counted against it, and whether its agent has a record on chain. */
export function chevrons(log: Pick<UnitLog, 'merges' | 'closed'> | undefined, reverts: number, onChain: boolean): Chevrons {
  const merges = log?.merges ?? 0;
  const closed = log?.closed ?? 0;
  const reasons: string[] = [];
  if (merges >= CHEVRON_MERGES) reasons.push(`${merges} merges`);
  const samples = merges + closed;
  if (samples >= MIN_SAMPLES && merges / samples >= CHEVRON_RATE) reasons.push(`${Math.round((merges / samples) * 100)}% merge rate`);
  if (merges >= CHEVRON_CLEAN && reverts === 0) reasons.push(`${merges} merges, none reverted`);
  if (onChain) reasons.push('a record on chain (ERC-8004)');
  return { white: reasons.length - (onChain ? 1 : 0), violet: onChain, reasons };
}

/** "3 chevrons", "1 chevron", or "" for none, counting the violet one. */
export function chevronWords(c: Chevrons): string {
  const n = c.white + (c.violet ? 1 : 0);
  return n === 0 ? '' : n === 1 ? '1 chevron' : `${n} chevrons`;
}

/**
 * The unit of the watch: of the units aboard (`ids`), the one with the best clean record on the last
 * watch, the day before `now` (most merges that day with no revert against it; ties by the quicker
 * median from opened to merged, then by id). So it is the same unit all day, in every browser. With
 * no merge on the last watch, nobody stands on the plinth.
 */
export function unitOfTheWatch(ids: readonly string[], logs: ReadonlyMap<string, UnitLog>, reverts: ReadonlyMap<string, number>, now: number): string | undefined {
  const d = new Date(now);
  const yesterday = dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 12).getTime());
  const fit = ids
    .map((id) => ({ id, log: logs.get(id), merges: logs.get(id)?.byDay[yesterday] ?? 0 }))
    .filter((u) => u.merges > 0 && (reverts.get(u.id) ?? 0) === 0);
  fit.sort((a, b) => b.merges - a.merges || (median(a.log?.openToMerge ?? []) ?? Infinity) - (median(b.log?.openToMerge ?? []) ?? Infinity) || a.id.localeCompare(b.id));
  return fit[0]?.id;
}

/** The roster's one-line record: "A-03 the Mechanic: 41 merges, 0 reverts". */
export function rosterLine(sign: string, epithet: string | undefined, log: Pick<UnitLog, 'merges' | 'closed' | 'stuck'> | undefined, reverts: number): string {
  const who = [sign, epithet].filter(Boolean).join(' ');
  const merges = log?.merges ?? 0;
  const parts = [`${merges} ${merges === 1 ? 'merge' : 'merges'}`, `${reverts} ${reverts === 1 ? 'revert' : 'reverts'}`];
  if (log?.closed) parts.push(`${log.closed} closed unmerged`);
  if (log?.stuck) parts.push(`stuck ${log.stuck === 1 ? 'once' : `${log.stuck} times`}`);
  return `${who}: ${parts.join(', ')}`;
}

/** The plaque on the plinth: "UNIT OF THE WATCH", "A-03 THE MECHANIC", "6 MERGES YESTERDAY, NONE REVERTED". */
export function plaqueLines(sign: string, epithet: string | undefined, merges: number): string[] {
  return ['UNIT OF THE WATCH', [sign, epithet].filter(Boolean).join(' ').toUpperCase(), `${merges} ${merges === 1 ? 'MERGE' : 'MERGES'} LAST WATCH, NONE REVERTED`];
}
