import type { Landing } from '../../../shared/protocol';

/** What a milestone says, as a toast and a notification: a title, and what's under it. */
export function landedText(kind: Landing, pr: number | undefined, by: string | undefined, title: string | undefined): { title: string; body: string } {
  if (kind === 'queue') return { title: 'The task queue is done', body: 'Every task on it is finished.' };
  const which = pr === undefined ? 'A pull request' : `PR #${pr}`;
  return { title: `${which} merged${by ? ` by ${by}` : ''}`, body: title ?? '' };
}

/** A merge as the toast gathers it: its pull request's number and who merged it. */
export interface MergeNote {
  pr?: number;
  by?: string;
}

/**
 * Merges that came in together, as one toast: one says what it always did, several say how many
 * ("3 PRs merged by Tess", "3 PRs merged" when more than one person merged them), with their numbers under it.
 */
export function gatheredText(merges: readonly MergeNote[], title?: string): { title: string; body: string } {
  if (merges.length <= 1) return landedText('merged', merges[0]?.pr, merges[0]?.by, title);
  const by = new Set(merges.map((m) => m.by ?? ''));
  const who = by.size === 1 && merges[0].by ? ` by ${merges[0].by}` : '';
  const nums = merges.filter((m) => m.pr !== undefined).map((m) => `#${m.pr}`);
  return { title: `${merges.length} PRs merged${who}`, body: nums.join(', ') };
}

/** How long a merge toast keeps gathering the next ones into itself (ms). */
export const GATHER_MS = 4000;
