// The inbox's warm lines in the crew voice (docs/voice.md), and when Kip may show: the all-clear line
// by time of day, Kip's pose in the all-clear pane, the merge and first-merge toasts, the first job,
// the thank-you after an answer, welcome back and the zero-wait day. Each line says its fact first and
// keeps the warm clause apart (`warm`), so a page can put the flourish in its own span and drop it
// while someone needs you (`quiet` false). The one module for the inbox's warmth: the client's words
// are client/home/warm.ts (loaded up front, they are only words) and Kip's art and beats
// client/home/kip-moments.ts (loaded the first time one is wanted). Pure, so the tests read it.

import type { KipStill } from './kip-art.js';
import type { ShipRecord } from './protocol.js';
import { WAIT_AMBER_MS, waitWords } from './wait.js';

/** The part of the day the all-clear line goes by, local time. */
export type Shift = 'morning' | 'afternoon' | 'evening' | 'night';

/** Morning 05-12, afternoon 12-18, evening 18-22, the night shift 22-05. */
export function shiftAt(hour: number): Shift {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

/** The night shift's own line, in place of the rotating one. */
export const NIGHT_LINE = "Still up? Nothing needs you. Kip's keeping watch.";

/** The all-clear pane's second line, one at a time: each is a quiet moment, never a task. */
export const CLEAR_LINES: readonly string[] = ['Go stretch. Kip has the watch.', 'Good time for a coffee.', "Quiet deck. Give an agent a job when you're ready."];

/** The all-clear heading: the fact, then who it is for. */
export const ALL_CLEAR = { fact: 'All clear.', warm: "Nobody's waiting on you." } as const;

/** The all-clear pane's one warm line at local `hour`: the night shift's, else one of the rotating lines (by the hour of `now`). */
export function greeting(hour: number, now: number): { shift: Shift; line: string } {
  const shift = shiftAt(hour);
  const line = shift === 'night' ? NIGHT_LINE : CLEAR_LINES[Math.floor(now / 3_600_000) % CLEAR_LINES.length];
  return { shift, line };
}

/** Kip in the all-clear pane: his lantern on the night shift, watching while agents work, else napping. */
export function calmPose(working: number, hour: number): KipStill {
  if (shiftAt(hour) === 'night') return 'lantern';
  return working > 0 ? 'watching' : 'napping';
}

/** A line split into the fact (always said) and the warm clause (only while nothing waits). */
export interface Said {
  fact: string;
  warm?: string;
}

/** The text of a Said, warm clause and all when `quiet`. */
export const sayAll = (s: Said, quiet = true) => (quiet && s.warm ? `${s.fact} ${s.warm}` : s.fact);

/** "Waited on you 32s." or "" when the wait is unknown. */
const waited = (ms: number | undefined) => (ms === undefined ? '' : ` Waited on you ${waitWords(ms)}.`);

/** The merge toast: "Merged: Fix the flaky checkout test. Waited on you 32s." then "3 on today's tape." */
export function mergedLine(task: string, waitedMs: number | undefined, onTape: number): Said {
  return { fact: `Merged: ${task}.${waited(waitedMs)}`, ...(onTape > 0 ? { warm: `${onTape} on today's tape.` } : {}) };
}

/**
 * The first merge ever, one short sentence and nothing else: the product's one exclamation mark
 * (EXCLAMATION_BUDGET), said plainly while someone needs you. No wait and no clock: a celebration
 * doesn't add up how long anyone waited.
 */
export function firstMergeLine(task: string, quiet = true): string {
  return quiet ? `First merge: ${task}!` : `First merge: ${task}.`;
}

/**
 * What the landed merge toast says. The first merge says its one sentence alone; any other says
 * the merge, the tape count while nothing needs you, and where it went (`where`). The first merge
 * stays up a little longer.
 */
export function landedNote(merged: Said, first: string | undefined, quiet: boolean): { fact: string; after?: string; where: boolean; ms: number } {
  if (first) return { fact: first, where: false, ms: 6500 };
  return { fact: merged.fact, ...(quiet && merged.warm ? { after: merged.warm } : {}), where: true, ms: 4500 };
}

/** The first job this browser gave out: "Fix the flaky checkout test is aboard." then where it comes back. */
export function firstJobLine(task: string): Said {
  return { fact: `${task} is aboard.`, warm: "It'll come back here when it needs you." };
}

/** How often "Thanks." may follow an answer. */
export const THANKS_EVERY_MS = 60_000;

/** After you answered: "Fix the flaky checkout test is back at work." and "Thanks." at most once a minute (`lastThanked` is when it was last said). */
export function answeredLine(task: string, now: number, lastThanked: number): Said {
  return { fact: `${task} is back at work.`, ...(now - lastThanked >= THANKS_EVERY_MS ? { warm: 'Thanks.' } : {}) };
}

/** How long away earns "Welcome back": a night's sleep, not a coffee. */
export const WELCOME_BACK_MS = 8 * 60 * 60_000;

/**
 * Back after WELCOME_BACK_MS: "Welcome back. While you were out: 4 merged," then the waiting part
 * ("1 waiting 2h"), which the page makes a link to the one waiting longest. `waiting` is undefined
 * when nothing waits.
 */
export function welcomeBack(merged: number, waitingCount: number, longestMs: number): { lead: string; waiting?: string; tail: string } {
  const lead = 'Welcome back.';
  if (!waitingCount) return { lead, tail: merged ? `While you were out: ${merged} merged. Nothing needs you.` : "Nothing needs you. Give an agent a job when you're ready." };
  return { lead: `${lead} While you were out: ${merged} merged,`, waiting: `${waitingCount} waiting ${waitWords(longestMs)}`, tail: '' };
}

/** How many of today's merges make a zero-wait day worth a line. */
export const ZERO_WAIT_MIN = 3;

/** "Nobody waited over 5 minutes today." with "Tight crew.", or undefined when someone did (or too little merged to say). */
export function zeroWaitLine(today: readonly Pick<ShipRecord, 'waitedMs'>[]): Said | undefined {
  if (today.length < ZERO_WAIT_MIN || today.some((r) => r.waitedMs === undefined || r.waitedMs > WAIT_AMBER_MS)) return undefined;
  return { fact: `Nobody waited over ${WAIT_AMBER_MS / 60_000} minutes today.`, warm: 'Tight crew.' };
}
