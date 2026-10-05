// The captain's turnaround (the pit wall in the Review bay, features/turnaround): how long units wait
// on the captain. Reply time is a unit asking (needs input) until someone answers it; review time is
// a unit's work coming to rest (done) until its pull request is merged or closed. Today against the
// last seven days, as plain numbers: a slow day is shown as a number and nothing else, never in red,
// never with a nag. Pure, so the server (server/pace.ts) and the tests say the same.

import type { TimelineEvent } from './protocol.js';
import { dayStart } from './pace.js';

const DAY_MS = 24 * 60 * 60_000;
/** The longest a single wait counts for (a unit left over a weekend is not a turnaround). */
export const TURNAROUND_CAP_MS = 3 * DAY_MS;
/** How many of today's reviews get a bar on the pit wall. */
export const REVIEW_BARS = 12;
/** How many units waiting for review bring the bay's light up a step. */
export const BAY_QUEUE = 3;

/** One wait the captain cleared: when, and how long it took. */
export interface Sample {
  at: number;
  ms: number;
}

/** A clock on the pit wall: today's median, the last seven days' median, and how many waits today. */
export interface Clock {
  today?: number;
  median7?: number;
  samples: number;
}

export interface Turnaround {
  reply: Clock;
  review: Clock & { bars: number[] };
  /** Today on this deck: pull requests merged or closed, and units back from stuck that landed work. */
  cleared: { reviews: number; recovered: number };
  /** The newest wait cleared, for the hairline run: a fast one runs once. */
  latest?: { kind: 'reply' | 'review'; ms: number; at: number };
}

export function median(xs: readonly number[]): number | undefined {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** A clock over `samples`: today's median and the median of the seven days before now. */
export function clockOf(samples: readonly Sample[], now = Date.now()): Clock {
  const today = dayStart(now);
  const day = samples.filter((s) => s.at >= today && s.at <= now).map((s) => s.ms);
  const week = samples.filter((s) => s.at > now - 7 * DAY_MS && s.at <= now).map((s) => s.ms);
  const out: Clock = { samples: day.length };
  const t = median(day);
  const w = median(week);
  if (t !== undefined) out.today = t;
  if (w !== undefined) out.median7 = w;
  return out;
}

/**
 * Review waits from a deck's timeline: each pull request merged or closed that names its unit, from
 * that unit's last 'done' before it (its work at rest, waiting on a person), else from the pull
 * request's opening. Waits over TURNAROUND_CAP_MS are left out.
 */
export function reviewSamples(events: readonly TimelineEvent[]): Sample[] {
  const sorted = [...events].sort((a, b) => a.at - b.at);
  const rest = new Map<string, number>();
  const opened = new Map<number, number>();
  const out: Sample[] = [];
  for (const e of sorted) {
    if (e.kind === 'pr-opened' && e.pr) opened.set(e.pr, e.at);
    if (e.kind === 'done' && e.worker) rest.set(e.worker, e.at);
    // Back at work: its next rest is the one a review waits on.
    if ((e.kind === 'needs-input' || e.kind === 'resumed') && e.worker) rest.delete(e.worker);
    if (e.kind !== 'pr-merged' && e.kind !== 'pr-closed') continue;
    const from = (e.worker ? rest.get(e.worker) : undefined) ?? (e.pr ? opened.get(e.pr) : undefined);
    if (e.worker) rest.delete(e.worker);
    if (from === undefined) continue;
    const ms = e.at - from;
    if (ms >= 0 && ms <= TURNAROUND_CAP_MS) out.push({ at: e.at, ms });
  }
  return out;
}

/** Units back from stuck that landed work (a done or a merge after a stuck and a resume) since `from`: the Tier 1 recovery's rule. */
export function recoveredSince(events: readonly TimelineEvent[], from: number): number {
  const state = new Map<string, { stuck: boolean; resumed: boolean }>();
  let n = 0;
  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    if (!e.worker) continue;
    const s = state.get(e.worker) ?? { stuck: false, resumed: false };
    if (e.kind === 'stuck') Object.assign(s, { stuck: true, resumed: false });
    else if (e.kind === 'resumed' && s.stuck) s.resumed = true;
    else if (e.kind === 'done' || e.kind === 'pr-merged') {
      if (s.stuck && s.resumed && e.at >= from) n++;
      Object.assign(s, { stuck: false, resumed: false });
    }
    state.set(e.worker, s);
  }
  return n;
}

/** The pit wall's numbers for a deck: its timeline and the reply waits the server saw. */
export function turnaroundOf(events: readonly TimelineEvent[], replies: readonly Sample[], now = Date.now()): Turnaround {
  const today = dayStart(now);
  const reviews = reviewSamples(events);
  const bars = reviews.filter((s) => s.at >= today && s.at <= now).slice(-REVIEW_BARS).map((s) => s.ms);
  const lastReply = replies.length ? replies[replies.length - 1] : undefined;
  const lastReview = reviews.length ? reviews[reviews.length - 1] : undefined;
  const latest = lastReply && (!lastReview || lastReply.at >= lastReview.at) ? { kind: 'reply' as const, ...lastReply } : lastReview ? { kind: 'review' as const, ...lastReview } : undefined;
  return {
    reply: clockOf(replies, now),
    review: { ...clockOf(reviews, now), bars },
    cleared: { reviews: events.filter((e) => (e.kind === 'pr-merged' || e.kind === 'pr-closed') && e.at >= today && e.at <= now).length, recovered: recoveredSince(events, today) },
    ...(latest ? { latest } : {}),
  };
}

/** A wait as the pit wall writes it: under a minute, minutes, then hours and minutes. */
export function waitText(ms: number | undefined): string {
  if (ms === undefined) return '--';
  const m = Math.round(ms / 60_000);
  if (m < 1) return '<1m';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

/** A clock's readout: "REPLY 3m (7-day 9m)". Slow or quick, it is the number and nothing more. */
export function clockLine(label: 'REPLY' | 'REVIEW', c: Clock): string {
  return `${label} ${waitText(c.today)} (7-day ${waitText(c.median7)})`;
}

/** Whether a wait cleared beat the seven-day median, so the bay's hairlines run once. */
export function fastClear(ms: number, median7: number | undefined): boolean {
  return median7 !== undefined && ms < median7;
}

/** How many reviews a day takes before it can be a good one. */
export const GOOD_DAY_REVIEWS = 3;

/** A good day on the pit wall: replies and reviews both under their seven-day medians, over a few reviews at least. */
export function goodDay(t: Pick<Turnaround, 'reply' | 'review' | 'cleared'>): boolean {
  const under = (c: Clock) => c.today !== undefined && c.median7 !== undefined && c.today < c.median7;
  return t.cleared.reviews >= GOOD_DAY_REVIEWS && under(t.reply) && under(t.review);
}

/**
 * The crew's line in the top bar's corner, framed as what the crew got through, never as a tally of
 * the captain: "2 units back on task", "4 PRs through review today". Null until the first one, so a
 * day never opens on a row of zeros.
 */
export function captainsBar(c: Turnaround['cleared']): string | null {
  const parts: string[] = [];
  if (c.recovered > 0) parts.push(`${c.recovered} ${c.recovered === 1 ? 'unit' : 'units'} back on task`);
  if (c.reviews > 0) parts.push(`${c.reviews} ${c.reviews === 1 ? 'PR' : 'PRs'} through review today`);
  return parts.length ? parts.join(', ') : null;
}
