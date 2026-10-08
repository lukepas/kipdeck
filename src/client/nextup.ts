// The workers waiting on you on this floor, the ones that need you before the ones that are done and
// longest first (the order of the building's ranking, shared/attention.ts): N takes you to each in turn (see
// features/waiting), arrows at the edge of the screen point to them (ui/compass.ts), and the Workers
// panel's button counts them. Every list of workers is in the building's one ranking instead
// (shared/attention.ts), which puts the same ones first.

import { attentionCounts, type Ranked } from '../shared/attention';
import type { RosterEntry, WorkerInfo } from '../shared/protocol';
import { waitingOnSomeone } from './notify';

type Waiting = WorkerInfo & { status: 'needs_input' | 'done' };

/** Since when it's been waiting (an office from before waitingSince had only the hire time). */
function since(w: WorkerInfo): number {
  return w.waitingSince ?? w.createdAt;
}

/** The ones stopped on a question or a permission come first, as the ranking's needs-you level comes before its review level. */
const blocked = (w: WorkerInfo) => (w.status === 'needs_input' ? 0 : 1);

/** Workers waiting on someone: the ones that need you, then the ones that are done, whoever has waited longest first. */
export function waitingInOrder(workers: Iterable<WorkerInfo>): Waiting[] {
  return [...workers].filter(waitingOnSomeone).sort((a, b) => blocked(a) - blocked(b) || since(a) - since(b) || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

/**
 * `workers` without the ones snoozed in the ranking (shared/attention.ts): a snooze means "not now",
 * so N, the count on its button and a desktop notification leave them out, as the banner and the chip do.
 */
export function unsnoozed<T extends { id: string }>(workers: Iterable<T>, ranked: readonly Ranked[]): T[] {
  const snoozed = new Set(ranked.filter((r) => r.att.snoozed).map((r) => r.entry.id));
  return [...workers].filter((w) => !snoozed.has(w.id));
}

/** Who has waited longest on someone on another floor than `here`, by the building-wide ranking (snoozed ones left out). */
export function waitingElsewhere(ranked: readonly Ranked[], here: string | null): RosterEntry | undefined {
  return ranked.find((r) => r.entry.floor !== here && !r.att.snoozed && (r.entry.status === 'needs_input' || (r.entry.status === 'done' && !r.entry.acked)))?.entry;
}

/** How many workers on floors other than `here` wait on someone, by the ranking (snoozed ones left out). */
export function waitingElsewhereCount(ranked: readonly Ranked[], here: string | null): number {
  return ranked.filter((r) => r.entry.floor !== here && !r.att.snoozed && (r.entry.status === 'needs_input' || (r.entry.status === 'done' && !r.entry.acked))).length;
}

/** "2 need you · 1 done": the ones that need input, then the ones that finished. */
export function waitingLabel(waiting: readonly WorkerInfo[]): string {
  const needs = waiting.filter((w) => w.status === 'needs_input').length;
  const done = waiting.length - needs;
  return [needs && `${needs} ${needs === 1 ? 'needs' : 'need'} you`, done && `${done} done`].filter(Boolean).join(' · ');
}

/** The levels N goes through, in this order: the ones that need you, then the stuck ones, then the ones to review. */
const N_LEVELS = ['needs-you', 'stuck', 'review'] as const;

/** One stop on N's round: who, and since when it has been that way (a new wait is new to the round). */
export interface Stop {
  id: string;
  since: number;
}

/**
 * N's round on a floor, straight from the building's ranking (shared/attention.ts) so it goes where
 * the top bar and the Attention board count: the ones that need you, then the stuck ones, then the
 * ones to review, longest first within each, snoozed ones left out.
 */
export function nLine(ranked: readonly Ranked[]): Stop[] {
  return N_LEVELS.flatMap((level) => ranked.filter((r) => r.att.level === level && !r.att.snoozed).map((r) => ({ id: r.entry.id, since: r.att.since })));
}

/**
 * The toast after N: "2 of 5: 2 need you · 1 stuck · 2 to review. N for the next", counted as the
 * top bar counts them, or null when there's only the one.
 */
export function nToast(line: readonly Stop[], id: string, ranked: readonly Ranked[]): string | null {
  if (line.length < 2) return null;
  const c = attentionCounts(ranked);
  const parts = [c['needs-you'] && `${c['needs-you']} ${c['needs-you'] === 1 ? 'needs' : 'need'} you`, c.stuck && `${c.stuck} stuck`, c.review && `${c.review} to review`].filter(Boolean);
  return `${line.findIndex((s) => s.id === id) + 1} of ${line.length}: ${parts.join(' · ')}. N for the next`;
}

/**
 * One press of N after another: the first worker in line you haven't been to yet this round, and
 * once you've been to them all, the first again. A worker that starts waiting again after you've
 * been to it is new to this round.
 */
export class NextUp {
  /** Who this round has been to, and the wait each was on then. */
  private visited = new Map<string, number>();

  /** The one to go to next from a line in order (see nLine). `here` is the worker you're standing at, which only comes up if it's the only one. */
  pick<T extends Stop>(line: readonly T[], here?: string): T | undefined {
    for (const [id, at] of this.visited) if (!line.some((w) => w.id === id && w.since === at)) this.visited.delete(id);
    const others = line.filter((w) => w.id !== here);
    let pick = others.find((w) => !this.visited.has(w.id));
    if (!pick) {
      this.visited.clear();
      pick = others[0] ?? line[0];
    }
    if (pick) this.visited.set(pick.id, pick.since);
    return pick;
  }

  /** The one to go to next among `workers` waiting on someone (see waitingInOrder). */
  next(workers: Iterable<WorkerInfo>, here?: string): Waiting | undefined {
    const waiting = waitingInOrder(workers);
    const id = this.pick(waiting.map((w) => ({ id: w.id, since: since(w) })), here)?.id;
    return waiting.find((w) => w.id === id);
  }
}
