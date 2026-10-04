// The numbers behind the bridge's life, kept free of three.js so the tests can pin them: how busy a
// station reads from its unit's terminal output, how its screen and blinkers show it, how often a
// busy station sends a data pulse to the holo table, how ambient life gives way when something needs
// you, and what the holo band and the ticker say.

import type { AttentionLevel } from '../../../shared/attention';
import type { TimelineEvent } from '../../../shared/protocol';
import type { ShipMotion } from '../../state/persist';

/** How a station's activity follows its terminal: each print adds `bump`, and it falls away with `decayS`. */
export const ACTIVITY = { bump: 0.35, decayS: 6, floorWorking: 0.3 } as const;

/** A station's activity once `dt` seconds have passed without a print. */
export function decay(a: number, dt: number): number {
  return a * Math.exp(-dt / ACTIVITY.decayS);
}

/** A station's activity once its terminal printed. */
export function bump(a: number): number {
  return Math.min(1, a + ACTIVITY.bump);
}

/**
 * How busy a station shows (0-1): a working unit's own activity, never under a low floor so a healthy
 * busy bridge always looks alive; anything else shows none (its state speaks for it).
 */
export function shownActivity(level: AttentionLevel | 'empty', activity: number): number {
  return level === 'working' ? Math.max(ACTIVITY.floorWorking, Math.min(1, activity)) : 0;
}

/**
 * What a station's screen shows, as the number the screen's shader switches on: nothing at the
 * console, standing by, at work (bars), and the four states that carry a glyph of their own.
 */
export const PANEL = { empty: 0, parked: 1, working: 2, review: 3, needs: 4, stuck: 5, merged: 6 } as const;
export type PanelMode = (typeof PANEL)[keyof typeof PANEL];

export function panelMode(level: AttentionLevel | 'merged' | 'empty'): PanelMode {
  switch (level) {
    case 'needs-you':
      return PANEL.needs;
    case 'stuck':
      return PANEL.stuck;
    case 'review':
      return PANEL.review;
    case 'working':
      return PANEL.working;
    case 'merged':
      return PANEL.merged;
    case 'parked':
      return PANEL.parked;
    default:
      return PANEL.empty;
  }
}

/**
 * Ambient life gives way: for DUCK_MS after a unit starts needing you or gets stuck everything ambient
 * runs at `duck`; a pod with a unit that needs you or is stuck stays at `hush` around it while it does;
 * and while anyone needs you at all the bridge keeps a little quieter (`waiting`).
 */
export const GIVE_WAY = { duckMs: 3000, duck: 0.4, hush: 0.3, waiting: 0.75 } as const;

/** How loud a station's ambient life is (0-1). */
export function stationGain(o: { ducking: boolean; podHushed: boolean; anyWaiting: boolean }): number {
  let g = 1;
  if (o.anyWaiting) g *= GIVE_WAY.waiting;
  if (o.podHushed) g *= GIVE_WAY.hush;
  if (o.ducking) g *= GIVE_WAY.duck;
  return g;
}

/** How Ship motion scales the bridge's own ambient life: Full as is, Calm at half, Off (and reduced motion) still. */
export function lifeScale(m: ShipMotion): number {
  return m === 'full' ? 1 : m === 'calm' ? 0.5 : 0;
}

/**
 * The seconds until a busy station sends its next data pulse to the holo table: every 6 s at the
 * floor of activity, every 1.8 s flat out, with a little jitter (`r` 0-1) so the stations don't march
 * in step; slower under Calm (`scale` 0.5); never while it's quiet, given way or still.
 */
export const PULSE = { slowS: 6, fastS: 1.8, flightS: 1.6, pool: 48 } as const;
export function pulseGap(activity: number, gain: number, scale: number, r: number): number {
  if (activity <= 0 || gain < 0.5 || scale <= 0) return Infinity;
  const a = Math.min(1, activity);
  const base = PULSE.slowS + (PULSE.fastS - PULSE.slowS) * a;
  return (base * (0.8 + 0.4 * r)) / scale;
}

/**
 * A station's three blinkers: each on for a short beat once a period, the periods long and unlike each
 * other (4.3 to 8.9 s, never a state's 1.2 s or 2 s cadence) and offset by the station, so the room
 * twinkles rather than flashes.
 */
export const BLINK = { periodsS: [4.3, 6.1, 8.9], onS: 0.35 } as const;
export function blinkOn(t: number, led: number, seed: number): boolean {
  const p = BLINK.periodsS[led % BLINK.periodsS.length];
  const phase = (t + seed * p * 7.31 + led * 1.7) % p;
  return phase < BLINK.onS;
}

/** How far a working unit's hands work the console: with its activity, none under reduced motion. */
export function typing(activity: number, calm: boolean): number {
  return calm ? 0 : Math.min(1, Math.max(0, activity));
}

/** A milestone's progress for the holo band: issues closed of linked, or none to measure. */
export interface Heading {
  statement: string;
  milestones: number;
  /** The waypoint the ship is making for, 1-based, and its title; none when every one is passed or there are none. */
  wp?: { n: number; title: string };
  /** Issues closed and linked on that waypoint. */
  closed: number;
  issues: number;
  /** Units at a station on it now. */
  units: number;
}

/** The percent of the way to the waypoint, honestly: issues closed of the ones linked, or none. */
export function percentTo(h: Pick<Heading, 'closed' | 'issues'>): number | undefined {
  return h.issues ? Math.round((h.closed / h.issues) * 100) : undefined;
}

/** What the holo band over the mission table says, phrase by phrase, upper case as the instruments do. */
export function headingPhrases(h: Heading): string[] {
  if (!h.statement && !h.milestones) return ['NO COURSE SET', 'SET THE COURSE IN MISSION CONTROL (I)'];
  const out: string[] = [];
  const pct = percentTo(h);
  if (h.wp) {
    out.push(pct === undefined ? `CAPTAIN, WE ARE MAKING FOR ${h.wp.title.toUpperCase()}` : `CAPTAIN, WE ARE ${pct}% OF THE WAY TO ${h.wp.title.toUpperCase()}`);
    out.push(`WP ${h.wp.n} OF ${h.milestones}`);
    if (h.issues) out.push(`${h.issues - h.closed} ${h.issues - h.closed === 1 ? 'ISSUE' : 'ISSUES'} OUT`);
    out.push(h.units ? `${h.units} ${h.units === 1 ? 'UNIT' : 'UNITS'} ON IT` : 'NO UNIT ON IT YET');
  } else if (h.milestones) out.push(`ALL ${h.milestones} WAYPOINTS PASSED`);
  if (h.statement) out.push(`COURSE: ${h.statement.replace(/\s+/g, ' ').toUpperCase()}`);
  return out;
}

const two = (n: number) => String(n).padStart(2, '0');

/** The time an event happened, on the ticker's log: hours and minutes, local. */
export function clockText(at: number): string {
  const d = new Date(at);
  return `${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** The ship's clock over the strip, ticking by the second: local hours, minutes and seconds. */
export function shipTime(at: number): string {
  const d = new Date(at);
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

/** How long something has run, as the ticker says it: 42s, 12m, 3h 05m. */
export function runFor(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${two(m % 60)}m`;
}

/** Under way since the earliest working unit started, or holding station with none at work. */
export function underWayText(workingSince: readonly number[], now: number): string {
  if (!workingSince.length) return 'HOLDING STATION';
  return `UNDER WAY ${runFor(now - Math.min(...workingSince))}`;
}

/** The ticker's log: the floor's latest events, newest first, each as its time and the office's own words. */
export function tickerItems(events: readonly TimelineEvent[], floor: string | null, max = 12): string[] {
  const mine = events.filter((e) => e.floor === floor).slice(0, max);
  if (!mine.length) return ['LOG IS QUIET ON THIS DECK'];
  return mine.map((e) => `${clockText(e.at)}  ${e.text.replace(/\s+/g, ' ')}`);
}
