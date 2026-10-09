// What a pod's ground label says: the goal its units work toward, and how they're doing, as
// "1 needs you · 3 working". Pure, so the words, their order and their colors are tested without a
// page (tests/pod-label.test.ts); draw.ts paints it.
import type { AttentionLevel, NextAction } from '../../../shared/attention';
import { ago } from '../../../shared/rowtext';
import { waitTone, type WaitTone } from '../../../shared/wait';
import type { PodGoal } from '../../../shared/pods';
import type { PodLetter } from '../../../shared/layout';

/** A count's tone: the state it's painted in, or grey for the calm ones. */
export type Tone = 'needs-you' | 'stuck' | 'review' | 'working' | 'idle';

/** One part of the counts line: `n` (none for "idle") and the words after it. */
export interface Segment {
  tone: Tone;
  n?: number;
  words: string;
  /** The first segment that waits on someone: how long its longest waiter has waited ("12m"), and that wait's tone. */
  wait?: string;
  waitTone?: WaitTone;
}

export interface PodLabelText {
  letter: PodLetter;
  /** The goal's title, clipped to TITLE_MAX characters, or '' without one (the counts stand alone then). */
  title: string;
  /** Whether there's a goal: without one the title under the counts is muted (draw.ts). */
  goal: boolean;
  segments: Segment[];
  /** Everything above in one string: a label is painted again only when this changes. */
  key: string;
}

/** The most of a goal's title the label shows. */
export const TITLE_MAX = 34;

/** A unit in the pod, as the ranking has it (shared/attention.ts). */
export interface PodUnit {
  level: AttentionLevel;
  snoozed: boolean;
  /** Since when it has been at its level (ms): for how long the pod's most urgent unit has waited. */
  since?: number;
  /** Which unit (for the cleared beat: who went from waiting on someone to done). */
  id?: string;
  /** What it wants done next: a merged one is told to stand down ('send-home'). */
  action?: NextAction;
}

/** Under this long a wait isn't on the label: "<1m" would only be noise beside the count. */
export const LABEL_WAIT_MIN = 60_000;

/** `t` cut to `max` characters at most, at a word where one is near, with an ellipsis. */
export function clipTitle(t: string, max = TITLE_MAX): string {
  const s = t.replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  // A word that ends right at the cut is kept whole.
  const space = s[max - 1] === ' ' ? cut.length : cut.lastIndexOf(' ');
  return `${(space >= max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:-]+$/, '')}…`;
}

/**
 * The counts line: what waits on you first (needs you, then stuck, then to review), then what's at
 * work; snoozed units are left out, as the top bar's chip leaves them out. Nothing of either: "idle".
 */
export function segments(units: Iterable<PodUnit>, now?: number): Segment[] {
  const c = { 'needs-you': 0, stuck: 0, review: 0, working: 0 };
  /** The longest wait at each level that waits on someone. */
  const oldest: Partial<Record<AttentionLevel, number>> = {};
  for (const u of units) {
    if (u.snoozed || u.level === 'parked') continue;
    c[u.level]++;
    if (u.since !== undefined && u.level !== 'working') oldest[u.level] = Math.min(oldest[u.level] ?? Infinity, u.since);
  }
  const out: Segment[] = [];
  if (c['needs-you']) out.push({ tone: 'needs-you', n: c['needs-you'], words: c['needs-you'] === 1 ? 'needs you' : 'need you' });
  if (c.stuck) out.push({ tone: 'stuck', n: c.stuck, words: 'stuck' });
  if (c.review) out.push({ tone: 'review', n: c.review, words: 'to review' });
  if (c.working) out.push({ tone: 'working', n: c.working, words: 'working' });
  if (!out.length) out.push({ tone: 'idle', words: 'idle' });
  // The most urgent count says how long its longest waiter has waited: "1 needs you 12m".
  const lead = out[0];
  const since = lead.tone === 'needs-you' || lead.tone === 'stuck' || lead.tone === 'review' ? oldest[lead.tone] : undefined;
  if (now !== undefined && since !== undefined && now - since >= LABEL_WAIT_MIN) Object.assign(lead, { wait: ago(now - since), waitTone: waitTone(now - since) });
  return out;
}

/** A segment as text: "3 working" (its wait, when it has one, is painted after it in its own tone: waitText). */
export const segmentText = (s: Segment) => (s.n === undefined ? s.words : `${s.n} ${s.words}`);

/** A segment's wait with the space before it, or ''. */
export const waitText = (s: Segment) => (s.wait ? ` ${s.wait}` : '');

/** The separator between segments. */
export const SEP = ' · ';

/** The whole counts line as text. */
export const countsText = (segs: readonly Segment[]) => segs.map((s) => segmentText(s) + waitText(s)).join(SEP);

/** What of a counts line fits: the segments shown, in order, and how many units the dropped ones hold ("+N"). */
export interface FittedLine {
  shown: Segment[];
  more: number;
}

/** The "+N" that stands in for dropped segments, with the separator before it. */
export const moreText = (n: number) => `${SEP}+${n}`;

/**
 * The counts line at one size, `max` wide as `measure` measures text: the lead (most urgent) segment and
 * its wait always, then the next ones in order while they fit; the rest dropped for "+N" (the units they
 * hold). The busiest pod never reads smaller than a calm one: the line is cut, not scaled.
 */
export function fitSegments(segs: readonly Segment[], measure: (t: string) => number, max: number): FittedLine {
  const piece = (s: Segment) => segmentText(s) + waitText(s);
  const shown: Segment[] = [segs[0]];
  let wide = measure(piece(segs[0]));
  for (let i = 1; i < segs.length; i++) {
    const next = wide + measure(SEP + piece(segs[i]));
    const rest = segs.slice(i + 1).reduce((n, s) => n + (s.n ?? 0), 0);
    if (next + (rest ? measure(moreText(rest)) : 0) > max) {
      return { shown, more: segs.slice(i).reduce((n, s) => n + (s.n ?? 0), 0) };
    }
    shown.push(segs[i]);
    wide = next;
  }
  return { shown, more: 0 };
}

/** A pod's label: its goal (if any) and its units' counts. */
export function podLabel(letter: PodLetter, goal: PodGoal | undefined, units: Iterable<PodUnit>, now?: number): PodLabelText {
  const title = goal ? clipTitle(goal.title ?? goal.goal) : '';
  const segs = segments(units, now);
  const tone = segs[0].waitTone ?? '';
  return { letter, title, goal: !!goal, segments: segs, key: `${letter}|${goal ? 1 : 0}|${title}|${countsText(segs)}|${tone}` };
}

/**
 * Which numbers roll when a label goes from `prev` to `next`: the tones whose count changed, with the
 * old number (none for a segment that's new).
 */
export function rolls(prev: readonly Segment[] | undefined, next: readonly Segment[]): Map<Tone, number | undefined> {
  const out = new Map<Tone, number | undefined>();
  if (!prev) return out;
  for (const s of next) {
    if (s.n === undefined) continue;
    const was = prev.find((p) => p.tone === s.tone);
    if (was?.n !== s.n) out.set(s.tone, was?.n);
  }
  return out;
}

/**
 * Where a unit stands for the cleared beat: 'waits' on someone (needs you, stuck, to review), 'done'
 * (back at work, or its pull request merged), or 'other' (parked, or snoozed: put aside isn't answered).
 */
export type Beat = 'waits' | 'done' | 'other';

export function beatOf(u: PodUnit): Beat {
  if (u.snoozed) return 'other';
  if (u.level === 'working' || (u.level === 'review' && u.action === 'send-home')) return 'done';
  if (u.level === 'needs-you' || u.level === 'stuck' || u.level === 'review') return 'waits';
  return 'other';
}

/** Each unit's beat by id (units without one left out). */
export function beats(units: Iterable<PodUnit>): Map<string, Beat> {
  const out = new Map<string, Beat>();
  for (const u of units) if (u.id) out.set(u.id, beatOf(u));
  return out;
}

/**
 * Whether a pod cleared one going from `prev` to `next`: a unit that waited on someone is now done
 * (answered, merged). A snooze, a unit standing down or leaving never counts: a dismissal isn't a win.
 */
export function cleared(prev: ReadonlyMap<string, Beat> | undefined, next: ReadonlyMap<string, Beat>): boolean {
  if (!prev) return false;
  for (const [id, b] of next) if (b === 'done' && prev.get(id) === 'waits') return true;
  return false;
}

/** How long a pod plate's rim glows once one of its units is answered or merged. */
export const CLEARED_MS = 900;
/** For how long at the start it glows at full strength, before it eases out. */
export const CLEARED_HOLD_MS = 120;

/** The rim's strength `ms` after the pod cleared one: 1 for CLEARED_HOLD_MS, then easing out to 0 by CLEARED_MS. */
export function clearedGlow(ms: number): number {
  if (!(ms >= 0) || ms >= CLEARED_MS) return 0;
  if (ms <= CLEARED_HOLD_MS) return 1;
  return (1 - (ms - CLEARED_HOLD_MS) / (CLEARED_MS - CLEARED_HOLD_MS)) ** 3;
}
