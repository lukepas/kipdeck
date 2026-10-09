// The start of watch (features/launch): the captain's log that opens the day, and the debrief after a
// while away. Only what happened, in the office's own words: merges, issues closed, bounties paid,
// attestations, how far the mission's waypoint has come, and who waits on the captain, that last
// always first. Dry, never loud: plain ASCII, no exclamation marks, no emoji, no war words
// (tests/copy.test.ts reads this file). Quiet days say so plainly. Pure, so the server (which writes
// the log to the timeline) and the page (which shows it) say the same.

import { TIMELINE_TEXT } from './protocol/timeline.js';
import { attentionLine, voiceHash } from './shipvoice.js';
import { duration } from './attention.js';

/** What the day's log is made of: every number from the timeline, the mission and the roster. */
export interface LogInput {
  /** Day of the mission (shared/pace.ts missionDay). */
  day: number;
  /** Yesterday across the fleet: merges, issues closed, bounties paid on devnet. */
  yesterday: { merges: number; issues: number; bounties: number };
  /** The waypoint under way on this deck, if a mission is set. */
  waypoint?: { n: number; title: string; pct?: number };
  /** Whether this deck has a mission at all. */
  mission: boolean;
  /** Units on this deck: waiting for review, with nothing to do, and aboard at all. */
  units: { review: number; idle: number; aboard: number };
}

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
/** A count to start a sentence with: a word up to ten, else digits. */
const count = (k: number) => WORDS[k] ?? String(k);
const plural = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const clip = (s: string, max: number) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 3).trimEnd()}...` : t;
};

/** "a, b and c". */
function listed(parts: string[]): string {
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The log's sentence about yesterday. */
export function yesterdayLine(y: LogInput['yesterday']): string {
  const parts: string[] = [];
  if (y.merges) parts.push(`merged ${plural(y.merges, 'pull request')}`);
  if (y.issues) parts.push(`closed ${plural(y.issues, 'issue')}`);
  if (y.bounties) parts.push(`paid ${plural(y.bounties, 'bounty', 'bounties')} on devnet`);
  return parts.length ? `Yesterday the fleet ${listed(parts)}.` : 'Yesterday was quiet: nothing merged and no issues closed.';
}

/** The log's sentence about the crew on this deck. */
export function crewLine(u: LogInput['units']): string {
  if (!u.aboard) return 'No units aboard yet.';
  const parts: string[] = [];
  if (u.review) parts.push(`${count(u.review)} ${u.review === 1 ? 'unit waits' : 'units wait'} for your review.`);
  if (u.idle) parts.push(`${count(u.idle)} ${u.idle === 1 ? 'unit awaits' : 'units await'} orders.`);
  return parts.length ? parts.join(' ') : 'Every unit is at work.';
}

/**
 * The captain's log for the day: "Day 14 of the mission. Yesterday the fleet merged 9 pull requests,
 * closed 14 issues and paid 3 bounties on devnet. Waypoint 3, Billing v2, is 60% done. Two units
 * await orders." At most TIMELINE_TEXT long: the waypoint's title is shortened first, then the crew's
 * sentence goes.
 */
export function captainsLog(i: LogInput): string {
  const wp = (max: number) => (i.waypoint ? `Waypoint ${i.waypoint.n}, ${clip(i.waypoint.title, max)}, ${i.waypoint.pct === undefined ? 'is under way' : `is ${Math.round(i.waypoint.pct)}% done`}.` : i.mission ? 'Every waypoint is passed.' : 'No mission is set yet.');
  const head = `Day ${i.day} of the mission. ${yesterdayLine(i.yesterday)}`;
  for (const max of [60, 36, 20]) {
    const text = `${head} ${wp(max)} ${crewLine(i.units)}`;
    if (text.length <= TIMELINE_TEXT) return text;
  }
  return clip(`${head} ${wp(20)}`, TIMELINE_TEXT);
}

/** The log as the launch types it onto the glass: its first sentence as a heading, the rest under it. */
export function crawlOf(log: string): { head: string; body: string } {
  const m = /^(Day \d+ of the mission\.)\s*(.*)$/s.exec(log);
  return m ? { head: m[1].replace(/\.$/, '').toUpperCase(), body: m[2] } : { head: 'CAPTAIN\'S LOG', body: log };
}

/** The launch as one line on the band, when a unit already needs the captain and the log on the glass gives way. */
export function stripLine(log: string): string {
  return `${crawlOf(log).head} - THE LOG IS ON THE TICKER`;
}

/** A unit that waits on the captain, as the debrief lists it first. */
export interface Waiting {
  id: string;
  sign: string;
  level: 'needs-you' | 'stuck';
  label: string;
}

/** What happened while the captain was away, from the timeline and the bounties. */
export interface DebriefInput {
  awayMs: number;
  waiting: Waiting[];
  merges: number;
  /** Bounties paid, written as the proof counter writes them ("12.00 USDC"), if any. */
  paid?: string;
  attested: number;
  /** Waypoints reached, by title. */
  reached: string[];
  /** How far each waypoint came: its issues closed before and now. */
  moved: { title: string; from: number; to: number; of: number }[];
  hired: number;
  recovered: number;
}

export interface Debrief {
  title: string;
  /** Who waits, first: one plain sentence each. */
  waiting: { id: string; level: 'needs-you' | 'stuck'; line: string }[];
  /** What landed, a line each. */
  lines: string[];
  /** VESPER's closing line, or null with the voice off. */
  closing: string | null;
}

/** The debrief's closing lines, by what the watch was like. */
const CLOSING = {
  good: [
    'That is the summary. The details are less modest.',
    'The crew kept the ship moving. I only kept count.',
    'I kept the log. It is mostly good news.',
    'Welcome back. The engines did not slow down while you were out.',
  ],
  quiet: ['It was quiet. I counted the stars instead.', 'Nothing to report. I checked twice.', 'A calm watch. Calm is underrated.'],
  plain: ['That is everything since you left.'],
  waiting: ['The rest can wait until they are answered.'],
} as const;

/**
 * The debrief: who waits on the captain first, in plain words (the humour stops while anyone does),
 * then what landed while away, then one closing line, picked by `seed` so every viewer reads the same.
 * `voice` is Settings > Deck > Ship's voice: off leaves the closing line out, plain keeps it plain.
 */
export function debriefOf(i: DebriefInput, voice: 'on' | 'plain' | 'off', seed: string): Debrief {
  const waiting = i.waiting.map((w) => ({ id: w.id, level: w.level, line: attentionLine(w.sign, w.level, w.label).text }));
  const lines: string[] = [];
  if (i.merges) lines.push(`${plural(i.merges, 'pull request')} merged.`);
  if (i.paid) lines.push(`${i.paid} paid on devnet.`);
  if (i.attested) lines.push(`${plural(i.attested, 'merge')} attested on Base Sepolia.`);
  for (const t of i.reached) lines.push(`Waypoint reached: ${clip(t, 60)}.`);
  for (const m of i.moved) if (m.to !== m.from) lines.push(`${clip(m.title, 40)}: ${m.from} of ${m.of} issues closed, now ${m.to}.`);
  if (i.recovered) lines.push(`${plural(i.recovered, 'unit')} came back from stuck and landed ${i.recovered === 1 ? 'its' : 'their'} work.`);
  if (i.hired) lines.push(`${plural(i.hired, 'unit')} came aboard.`);
  const quiet = !lines.length;
  if (quiet) lines.push('Nothing landed while you were away.');
  const book = voice === 'off' ? null : waiting.length ? CLOSING.waiting : voice === 'plain' ? CLOSING.plain : quiet ? CLOSING.quiet : CLOSING.good;
  return {
    title: `SINCE YOU LEFT - ${duration(i.awayMs).toUpperCase()}`,
    waiting,
    lines,
    closing: book ? book[voiceHash(seed) % book.length] : null,
  };
}

/** How the start of watch plays (Settings > Deck > Start of watch). */
export type WatchMode = 'full' | 'debrief' | 'off';

/** Away this long, or the first visit of a new day: the launch. */
export const LAUNCH_AWAY_MS = 8 * 60 * 60_000;
/** Away this long (the tab hidden or no input): the debrief. */
export const DEBRIEF_AWAY_MS = 20 * 60_000;

/** What the start of watch plays for a captain back after `awayMs`, on a new day or not: the launch, the debrief, or nothing. */
export function watchTrigger(o: { mode: WatchMode; awayMs: number; newDay: boolean; watching: boolean }): 'launch' | 'debrief' | null {
  if (o.mode === 'off' || o.watching) return null;
  if (o.mode === 'full' && (o.newDay || o.awayMs >= LAUNCH_AWAY_MS)) return 'launch';
  if (o.awayMs >= DEBRIEF_AWAY_MS) return 'debrief';
  return null;
}
