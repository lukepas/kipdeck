// What a pod's ground label says: the goal its units work toward, and how they're doing, as
// "1 needs you · 3 working". Pure, so the words, their order and their colors are tested without a
// page (tests/pod-label.test.ts); draw.ts paints it.
import type { AttentionLevel } from '../../../shared/attention';
import type { PodGoal } from '../../../shared/pods';
import type { PodLetter } from '../../../shared/layout';

/** A count's tone: the state it's painted in, or grey for the calm ones. */
export type Tone = 'needs-you' | 'stuck' | 'review' | 'working' | 'idle';

/** One part of the counts line: `n` (none for "idle") and the words after it. */
export interface Segment {
  tone: Tone;
  n?: number;
  words: string;
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
}

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
export function segments(units: Iterable<PodUnit>): Segment[] {
  const c = { 'needs-you': 0, stuck: 0, review: 0, working: 0 };
  for (const u of units) if (!u.snoozed && u.level !== 'parked') c[u.level]++;
  const out: Segment[] = [];
  if (c['needs-you']) out.push({ tone: 'needs-you', n: c['needs-you'], words: c['needs-you'] === 1 ? 'needs you' : 'need you' });
  if (c.stuck) out.push({ tone: 'stuck', n: c.stuck, words: 'stuck' });
  if (c.review) out.push({ tone: 'review', n: c.review, words: 'to review' });
  if (c.working) out.push({ tone: 'working', n: c.working, words: 'working' });
  if (!out.length) out.push({ tone: 'idle', words: 'idle' });
  return out;
}

/** A segment as text: "3 working". */
export const segmentText = (s: Segment) => (s.n === undefined ? s.words : `${s.n} ${s.words}`);

/** The separator between segments. */
export const SEP = ' · ';

/** The whole counts line as text. */
export const countsText = (segs: readonly Segment[]) => segs.map(segmentText).join(SEP);

/** A pod's label: its goal (if any) and its units' counts. */
export function podLabel(letter: PodLetter, goal: PodGoal | undefined, units: Iterable<PodUnit>): PodLabelText {
  const title = goal ? clipTitle(goal.title ?? goal.goal) : '';
  const segs = segments(units);
  return { letter, title, goal: !!goal, segments: segs, key: `${letter}|${goal ? 1 : 0}|${title}|${countsText(segs)}` };
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
