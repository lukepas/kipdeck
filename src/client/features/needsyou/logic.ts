/**
 * What "a worker needs you" works out with nothing to draw: who needs you (the building's one ranking,
 * see shared/attention.ts), who just started, what the banner says about them, and when to ring again.
 * No three.js and no page here, so the tests run it as it is.
 */
import { duration, type Ranked } from '../../../shared/attention';
import type { RosterEntry } from '../../../shared/protocol';
import { alertDetail } from '../../../shared/status';

/** How long between reminders while a worker's still waiting on an answer nobody's looking at (ms). */
export const REMIND_EVERY = 30_000;

/**
 * The workers that need you: the ranking's needs-you level, the snoozed ones left out (a snooze means
 * "not now", so no banner, beacon or alarm for it). In the ranking's order: whoever has waited longest first.
 */
export function needingYou(ranked: readonly Ranked[]): RosterEntry[] {
  return ranked.filter((r) => r.att.level === 'needs-you' && !r.att.snoozed).map((r) => r.entry);
}

/** One wait of a worker's: asking something else later is another one. */
export const waitKey = (e: Pick<RosterEntry, 'id' | 'waitingSince' | 'createdAt'>) => `${e.id}@${e.waitingSince ?? e.createdAt}`;

/** Nobody has its terminal open, so nobody's answering it. */
export const unattended = (w: { viewers: readonly string[] }) => w.viewers.length === 0;

export interface BannerText {
  /** The worker it takes you to: whoever has waited longest. */
  id: string;
  floor: string;
  deskId: string;
  title: string;
  /** What it's asking, where (when that's another floor) and for how long. */
  detail: string;
  /** How many more are asking, or ''. */
  more: string;
  /** Changes whenever the banner would read differently. */
  key: string;
}

/**
 * What the banner says about `asking` (see needingYou), or null with nobody to show. `here` is the
 * floor you're on: whoever has waited longest on it comes first, as N goes (features/waiting), and
 * one on another floor says which.
 */
export function bannerText(asking: readonly RosterEntry[], now: number, here: string | null): BannerText | null {
  const e = asking.find((a) => a.floor === here) ?? asking[0];
  if (!e) return null;
  const ask = alertDetail(e)?.replace(/\s+/g, ' ').trim();
  const since = e.waitingSince ?? e.createdAt;
  // Nothing for its first minute: "under a minute" would only be noise.
  const waited = now - since >= 60_000 ? duration(now - since) : '';
  const where = e.floor !== here ? `on ${e.floorName}` : '';
  const detail = [ask && (ask.length > 90 ? `${ask.slice(0, 89)}…` : ask), where, waited].filter(Boolean).join(' · ');
  const more = asking.length > 1 ? `+${asking.length - 1} more` : '';
  const title = `${e.name} needs you`;
  return { id: e.id, floor: e.floor, deskId: e.deskId, title, detail, more, key: `${e.id}|${title}|${detail}|${more}` };
}

/** Tells a worker that has just started needing you from one that already did when the page first saw it. */
export class Fresh {
  private last = new Map<string, boolean>();

  /** The workers in `ranked` (one floor's) that started needing you since the last look. */
  take(ranked: readonly Ranked[]): RosterEntry[] {
    const asking = new Set(needingYou(ranked).map((e) => e.id));
    const out: RosterEntry[] = [];
    const seen = new Set<string>();
    for (const { entry } of ranked) {
      seen.add(entry.id);
      const before = this.last.get(entry.id);
      const now = asking.has(entry.id);
      this.last.set(entry.id, now);
      if (before === false && now) out.push(entry);
    }
    // Gone, or on a floor you've left: new to the page if it comes back.
    for (const id of this.last.keys()) if (!seen.has(id)) this.last.delete(id);
    return out;
  }
}

/** When to ring again: every REMIND_EVERY for as long as someone's asking and nobody's at its terminal. */
export class Reminders {
  private last = 0;
  private waiting = false;

  /** The alarm just rang: the next reminder is a whole wait away. */
  rang(now: number) {
    this.last = now;
    this.waiting = true;
  }

  /** Nobody the last wait was for is here any more (you've changed floors): the next one starts from scratch. */
  quiet() {
    this.waiting = false;
  }

  /** Whether to ring now, for `asking` (the workers that need you, with who has their terminal open). Says yes once per wait. */
  due(asking: readonly { viewers: readonly string[] }[], now: number): boolean {
    if (!asking.some(unattended)) {
      this.waiting = false;
      return false;
    }
    // Someone's asking again (or was when the page came up): the wait starts here, quietly.
    if (!this.waiting) {
      this.rang(now);
      return false;
    }
    if (now - this.last < REMIND_EVERY) return false;
    this.last = now;
    return true;
  }
}
