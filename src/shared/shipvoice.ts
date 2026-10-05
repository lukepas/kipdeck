// VESPER, the ship's mind: one line now and then about what the crew really did. A phrasebook keyed by
// the event and what is true around it (the first merge of the watch, a unit's tenth, a streak, a
// comeback from stuck, a waypoint, a bounty paid, the hour), and a seeded pick, so every viewer of the
// same event reads the same line. No model call, no voice: text only.
//
// Dry, never loud: plain ASCII, no exclamation marks, no emoji, no war words (tests/copy.test.ts reads
// this file). The humour is in the words, never in colour or noise, and it is about units and outcomes,
// never a ranking of people. The moment a unit needs the captain, the wit stops and VESPER says one
// plain sentence (attentionLine), then stays quiet until that clears (VoiceGate).

import type { TimelineEvent } from './protocol.js';

/** How VESPER speaks (Settings > Bridge > Ship's voice, where Off is the caller's to honour): with humour, or plain status lines only. */
export type VoiceStyle = 'on' | 'plain';

/** What VESPER can speak about. Each is a real event or a real stretch of state, never a timer. */
export type VoiceKind = 'merged' | 'milestone-done' | 'mission' | 'bounty-paid' | 'merge-attested' | 'hired' | 'recovered' | 'all-clear' | 'quiet' | 'good-day';

/** What is true around an event: every field is worked out from the timeline and the roster. */
export interface VoiceContext {
  /** The unit's call sign ("B-03"), else its name. */
  unit?: string;
  /** Its name, for the hire line. */
  name?: string;
  pr?: number;
  /** A waypoint's title, or the mission's statement. */
  title?: string;
  /** This unit's merges in the log, this one counted. */
  nth?: number;
  /** Merges on this deck in the last hour, this one counted. */
  mergesThisHour?: number;
  /** No other merge on this deck since local midnight. */
  firstOfDay?: boolean;
  /** Merges on this deck since a unit was last stuck, this one counted. */
  streak?: number;
  /** This unit was stuck since its last merge and merged anyway. */
  comeback?: boolean;
  /** Minutes with nobody waiting on the captain while units worked. */
  quietMin?: number;
  /** The local hour (0-23). */
  hour?: number;
  /** A new hire's white chevrons (its agent's record). */
  chevrons?: number;
  /** Its epithet, words only ("the Mechanic"). */
  epithet?: string;
}

/** A line to speak: what it says, which unit it is about (never two in a row about one unit), and how much it matters. */
export interface VoiceLine {
  text: string;
  unit?: string;
  /** Higher holds over lower when both wait for the gate: a waypoint over a merge over a quiet stretch. */
  weight: number;
}

const WEIGHT: Record<VoiceKind, number> = { 'milestone-done': 4, mission: 3, 'bounty-paid': 2, 'merge-attested': 2, merged: 1, hired: 1, recovered: 1, 'all-clear': 1, quiet: 0, 'good-day': 0 };

/** The merge counts worth a remark. */
const MILESTONE_MERGES = new Set([5, 10, 25, 50, 100, 250]);

/** FNV-1a: the same seed picks the same line in every browser. */
export function voiceHash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const clip = (s: string, max: number) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 3).trimEnd()}...` : t;
};

const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${s}`;
};

/** Fills {unit}, {pr}, {title}, {n}, {nth}, {streak}, {m}, {name}, {epithet}. */
function fill(t: string, c: VoiceContext): string {
  return t
    .replace(/\{unit\}/g, c.unit ?? 'A unit')
    .replace(/\{name\}/g, c.name ?? c.unit ?? 'A unit')
    .replace(/\{pr\}/g, c.pr !== undefined ? `PR #${c.pr}` : 'its pull request')
    .replace(/\{title\}/g, clip(c.title ?? '', 48))
    .replace(/\{n\}/g, String(c.mergesThisHour ?? 0))
    .replace(/\{nth\}/g, ordinal(c.nth ?? 0))
    .replace(/\{streak\}/g, String(c.streak ?? 0))
    .replace(/\{m\}/g, String(c.quietMin ?? 0))
    .replace(/\{epithet\}/g, c.epithet ?? '');
}

/** The wit, by kind: the first bucket whose test holds is the one picked from. */
const WIT: Record<VoiceKind, [test: (c: VoiceContext) => boolean, lines: string[]][]> = {
  merged: [
    [(c) => (c.mergesThisHour ?? 0) >= 3, ['{n} merges this hour. The engines have noticed.', '{n} merges this hour. I am revising my forecasts upward.', '{n} merges in one hour. Recalculating arrival, again.']],
    [(c) => !!c.comeback, ['{unit} was stuck earlier and landed {pr} anyway. I will be updating its file.', '{unit} came back from stuck and merged. Resilience, logged.', 'From stuck to merged. {unit} does not give up easily.']],
    [(c) => MILESTONE_MERGES.has(c.nth ?? 0), ["{unit}'s {nth} merge. It is becoming a habit.", "That is {unit}'s {nth} merge. I have started keeping a separate shelf.", "{nth} merge for {unit}. Consistency is underrated."]],
    [(c) => !!c.firstOfDay, ['First merge of the day. The watch has officially begun.', 'First merge today. I have logged it with unnecessary ceremony.', 'The day has its first merge. Everything after this is momentum.']],
    [(c) => (c.streak ?? 0) >= 5, ['{streak} merges and nobody stuck. I am cautiously impressed.', '{streak} clean merges in a row. I will not jinx it by saying more.']],
    [(c) => c.hour !== undefined && (c.hour >= 22 || c.hour < 5), ['A merge on the night watch. The quiet hours are not so quiet.', 'Merged at this hour. The stars approve, presumably.']],
    [() => true, ['{unit} landed {pr}. Nobody panicked.', '{pr} is in. The ship is a little faster for it.', 'Merged. One more thing that works.', '{unit} merged {pr}. Course holds.', '{pr} merged. I would clap if I had hands.']],
  ],
  'milestone-done': [[() => true, ['Waypoint reached. I will pretend I was never worried.', 'Waypoint {title} reached. Plotting the next one before anyone asks.', 'Waypoint down. The destination is closer than my estimates suggested.', '{title}: done. The crew made that look easy. It was not.']]],
  mission: [[() => true, ['New heading: {title}. I like it already.', 'Course laid in for {title}. Let us see what this ship can do.', 'Mission set: {title}. I have cleared my schedule.']]],
  'bounty-paid': [[() => true, ['Bounty paid on devnet. Good work, now with a receipt.', 'A bounty settled on devnet. The ledger smiles, in its way.', 'Paid on devnet. Merit, meet money.']]],
  'merge-attested': [[() => true, ['The merge is on chain. Even the auditors will agree.', 'Attested on Base Sepolia. It happened, and now everyone can check.', 'Proof of merge, written down for good. I find that reassuring.']]],
  hired: [
    [(c) => (c.chevrons ?? 0) > 0, ['{name} ({unit}) reporting, {chevrons}. A record precedes it.', '{name} ({unit}) reporting, {chevrons}. Welcome back to the line.']],
    [() => true, ['{name} ({unit}) reporting. First day aboard. Be gentle.', '{name} ({unit}) reporting. Fresh off the line and eager, I assume.']],
  ],
  recovered: [[() => true, ['{unit} is back at work. I never doubted it. Much.', '{unit} is moving again. Crisis handled with minimal drama.', '{unit} is back on task. Thank you, Captain.']]],
  'all-clear': [[() => true, ['All clear. Nobody is waiting on you. Carry on, Captain.', 'Every unit is unblocked. I will go back to being clever now.', 'All clear on deck. That was quick work.']]],
  quiet: [[() => true, ['Nobody has needed you for {m} minutes. This is what good looks like.', '{m} minutes without a single call. The crew has this.', '{m} quiet minutes. The work is flowing and nobody is waiting.']]],
  'good-day': [[() => true, ['Replies and reviews both quicker than the week. The crew noticed, even if they will not say so.', 'Turnaround is ahead of the seven-day pace today. I have logged it twice, for emphasis.', 'The pit wall is reading fast today. The units barely had time to wait.']]],
};

/** The plain lines: status only, for Ship's voice at Plain only (and under Silent running). */
const PLAIN: Record<VoiceKind, string> = {
  merged: '{unit} merged {pr}.',
  'milestone-done': 'Waypoint {title} reached.',
  mission: 'New mission set: {title}.',
  'bounty-paid': 'Bounty paid on devnet.',
  'merge-attested': 'Merge attested on Base Sepolia.',
  hired: '{name} ({unit}) reporting.',
  recovered: '{unit} is back at work.',
  'all-clear': 'All clear: nobody is waiting on you.',
  quiet: 'No calls for {m} minutes.',
  'good-day': 'Replies and reviews are faster than the last seven days.',
};

const chevronWords = (n: number) => (n === 1 ? '1 chevron' : `${n} chevrons`);

/**
 * The line for `kind` in `ctx`, chosen by `seed` (an event's id), so every viewer reads the same one.
 * Plain gives the status line; On gives the wit. Off is for the caller to honour (it says nothing).
 */
export function pick(kind: VoiceKind, ctx: VoiceContext, seed: string, mode: VoiceStyle = 'on'): VoiceLine {
  const c = { ...ctx };
  const chev = (s: string) => s.replace(/\{chevrons\}/g, chevronWords(c.chevrons ?? 0));
  let text: string;
  if (mode === 'plain') text = PLAIN[kind];
  else {
    const bucket = WIT[kind].find(([test]) => test(c)) ?? WIT[kind][WIT[kind].length - 1];
    const lines = bucket[1];
    text = lines[voiceHash(`${kind}:${seed}`) % lines.length];
  }
  // The hire line names the chevrons in plain words whatever the mode.
  if (kind === 'hired' && mode === 'plain' && (c.chevrons ?? 0) > 0) text = '{name} ({unit}) reporting, {chevrons}.';
  return { text: chev(fill(text, c)), unit: c.unit, weight: WEIGHT[kind] };
}

/**
 * The one plain sentence when a unit starts needing the captain or gets stuck: no wit, whatever the
 * mode. "B-03 is stuck: tests or build failing. It needs you." "A-02 is waiting on your answer."
 */
export function attentionLine(unit: string, level: 'needs-you' | 'stuck', label: string): VoiceLine {
  const what = clip(label, 60).replace(/[.\s]+$/, '');
  const text = level === 'stuck' ? `${unit} is stuck: ${what.charAt(0).toLowerCase()}${what.slice(1)}. It needs you.` : `${unit} is waiting on your answer. It needs you.`;
  return { text, unit, weight: 9 };
}

/** VESPER's pace: at most one line in this long (ms), except the attention sentence and one recovery line. */
export const VOICE_GAP_MS = 90_000;
/** A held line older than this is dropped rather than spoken late (ms). */
export const VOICE_STALE_MS = 5 * 60_000;
/** The quiet stretches worth a remark (minutes), each once per stretch. */
export const QUIET_MARKS = [40, 120] as const;

/**
 * When VESPER may speak. At most one line per VOICE_GAP_MS, never two in a row about one unit; a
 * line that can't go now waits (the weightier one wins) until the gap is over. The instant something
 * needs the captain, the wit stops: the attention sentence goes at once and nothing else is said until
 * attention clears; then one recovery line may go straight away.
 */
export class VoiceGate {
  private lastAt = -Infinity;
  private lastUnit: string | undefined;
  private held: { line: VoiceLine; at: number } | null = null;
  private quiet = false;
  private recovery = false;

  /** Something needs the captain (true) or nothing does (false). Returns the sentence to say now, if any. */
  attention(on: boolean, now: number, line?: VoiceLine): VoiceLine | null {
    if (on) {
      // One sentence when it starts; nothing more while it lasts, however many more join it.
      const start = !this.quiet;
      this.quiet = true;
      this.recovery = false;
      this.held = null;
      if (!line || !start) return null;
      this.lastAt = now;
      this.lastUnit = line.unit;
      return line;
    }
    if (this.quiet) {
      this.quiet = false;
      this.recovery = true;
    }
    return null;
  }

  /** Whether VESPER is holding its wit because something needs the captain. */
  get silent(): boolean {
    return this.quiet;
  }

  /** Offers a line: it says whether it goes now; one that can't is held for later (see due). */
  offer(line: VoiceLine, now: number): VoiceLine | null {
    if (this.quiet) return null;
    if (this.recovery && line.weight >= 1) {
      this.recovery = false;
      return this.say(line, now);
    }
    if (now - this.lastAt >= VOICE_GAP_MS && (line.unit === undefined || line.unit !== this.lastUnit)) return this.say(line, now);
    if (!this.held || line.weight >= this.held.line.weight) this.held = { line, at: now };
    return null;
  }

  /** The held line, once the gap is over and it is still worth saying. */
  due(now: number): VoiceLine | null {
    const h = this.held;
    if (!h || this.quiet) return null;
    if (now - h.at > VOICE_STALE_MS) {
      this.held = null;
      return null;
    }
    if (now - this.lastAt < VOICE_GAP_MS) return null;
    if (h.line.unit !== undefined && h.line.unit === this.lastUnit) {
      // Never two in a row about one unit: it lets the gap go by once more for someone else.
      if (now - this.lastAt < VOICE_GAP_MS * 2) return null;
    }
    this.held = null;
    return this.say(h.line, now);
  }

  private say(line: VoiceLine, now: number): VoiceLine {
    this.lastAt = now;
    this.lastUnit = line.unit;
    this.held = null;
    return line;
  }
}

/**
 * What is true around a merge, from the timeline (any order; `e` counts whether or not it is in
 * `events`): merges on its deck this hour and since anyone was last stuck, whether it is the day's
 * first, its unit's count, and whether its unit came back from stuck to land it.
 */
export function mergeContext(e: TimelineEvent, events: readonly TimelineEvent[]): VoiceContext {
  const here = events.filter((x) => x.floor === e.floor && x.at <= e.at && x.id !== e.id).concat(e);
  const merges = here.filter((x) => x.kind === 'pr-merged');
  const midnight = new Date(e.at);
  midnight.setHours(0, 0, 0, 0);
  const lastStuck = Math.max(-Infinity, ...here.filter((x) => x.kind === 'stuck').map((x) => x.at));
  const ctx: VoiceContext = {
    pr: e.pr,
    mergesThisHour: merges.filter((x) => e.at - x.at < 3_600_000).length,
    firstOfDay: !merges.some((x) => x.id !== e.id && x.at >= midnight.getTime()),
    streak: merges.filter((x) => x.at > lastStuck).length,
    hour: new Date(e.at).getHours(),
  };
  if (e.worker) {
    const mine = here.filter((x) => x.worker === e.worker);
    const before = mine.filter((x) => x.kind === 'pr-merged' && x.id !== e.id).map((x) => x.at);
    const since = before.length ? Math.max(...before) : -Infinity;
    ctx.nth = before.length + 1;
    ctx.comeback = mine.some((x) => x.kind === 'stuck' && x.at > since);
  }
  return ctx;
}
