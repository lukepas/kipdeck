// The rules every part of the bridge's life plays by, kept free of three.js so the tests can pin them:
// what each Life level (Settings > Deck > Life) lets through, how fast ambient life may move under
// Ship motion and reduced motion, and how a set piece waits behind attention. Attention always wins:
// a unit that starts needing you or gets stuck ducks every bit of life for a few seconds, its pod stays
// hushed while it lasts, and everything runs a little quieter while anyone waits on you.

import type { LifeLevel, ShipMotion } from '../../state/persist';
import { GIVE_WAY } from '../life/logic';
import { motionScale } from '../space/logic';

export { GIVE_WAY };

/**
 * What a piece of life is:
 * - ambient: runs on its own while the deck is healthy (a fighter's patrol, an escort's bob);
 * - gesture: a small flourish on a real event (a salute, a hail line);
 * - setpiece: a moment on a real milestone (arriving at the mission's world).
 */
export type LifeAct = 'ambient' | 'gesture' | 'setpiece';

/** Whether Life at `level` lets `act` play: Calm drops the gestures, Silent running keeps only set pieces. */
export function lifeAllows(level: LifeLevel, act: LifeAct): boolean {
  if (level === 'full') return true;
  if (level === 'calm') return act !== 'gesture';
  return act === 'setpiece';
}

/** How far the stars slow under Silent running: a crawl, never a dead stop. */
export const STAR_CRAWL = 0.06;

/** How fast space outside moves at `level`: as Ship motion says, or a crawl under Silent running. */
export function starScale(level: LifeLevel): number {
  return level === 'silent' ? STAR_CRAWL : 1;
}

/** How fast the bridge's own ambient life runs at `level` (the stations, the holo, the ticker): none under Silent running. */
export function ambientGain(level: LifeLevel): number {
  return level === 'silent' ? 0 : 1;
}

/**
 * How fast an ambient motion runs (0 holds it still): as Ship motion scales it (Full 1, Calm 0.5,
 * Off and reduced motion 0), and not at all under Silent running.
 */
export function ambientMotion(level: LifeLevel, ship: ShipMotion): number {
  return motionScale(ship) * ambientGain(level);
}

/**
 * How a set piece shows: played out at Full ship motion in a tab in view; otherwise a 400 ms
 * crossfade and a card, so nothing moves where motion is off and nothing plays out of nowhere.
 */
export function setPieceForm(ship: ShipMotion, visible: boolean): 'play' | 'card' {
  return ship === 'full' && visible ? 'play' : 'card';
}
/** The crossfade a set piece becomes under reduced motion (ms). */
export const CROSSFADE_MS = 400;

/** How quiet ambient life runs now (0-1): ducked for a moment, quieter while anyone waits on you. */
export function lifeGain(o: { ducking: boolean; waiting: boolean }): number {
  return (o.ducking ? GIVE_WAY.duck : 1) * (o.waiting ? GIVE_WAY.waiting : 1);
}

/**
 * The spectacle's duck (the shafts, the dust, the nebula's knots, the giant): a unit that has just
 * started needing you or got stuck takes it down to `to` for `ms`, then it comes back to its
 * waiting level. It is a beat that says "look", not a dimmer left on: the room stays alive while
 * anyone waits, and only a local vignette round the waiting station and the hero rows holds.
 */
export const SPECTACLE_DUCK = { to: 0.6, ms: 2500 } as const;

/**
 * How far the spectacle stands (0-1): ducked for SPECTACLE_DUCK.ms after a new call (`callAgeMs` since
 * it), at `given` while anyone needs you or is stuck, full otherwise.
 */
export function spectacleTarget(attention: boolean, callAgeMs: number, given: number): number {
  if (callAgeMs >= 0 && callAgeMs < SPECTACLE_DUCK.ms) return Math.min(given, SPECTACLE_DUCK.to);
  return attention ? given : 1;
}

/** How long a set piece may wait behind attention before it gives up and becomes a card (ms). */
export const CARD_AFTER_MS = 10 * 60_000;

/**
 * Set pieces waiting their turn: one at a time, a higher tier swallows a lower one, and each waits
 * while anything needs you or is stuck. One held past CARD_AFTER_MS comes out as a card instead.
 */
export class HeldPieces<T> {
  private held: { item: T; tier: number; at: number } | null = null;

  /** Holds `item` at `tier` from `now`: it replaces one held of the same or a lower tier, and is dropped under a higher one. */
  push(item: T, tier: number, now: number) {
    if (this.held && this.held.tier > tier) return;
    this.held = { item, tier, at: now };
  }

  /** What is held, if anything. */
  peek(): T | null {
    return this.held?.item ?? null;
  }

  /** The held piece, if its turn has come: nothing needs you now, or it has waited too long and goes as a card. */
  next(now: number, attention: boolean): { item: T; card: boolean } | null {
    const h = this.held;
    if (!h) return null;
    const stale = now - h.at >= CARD_AFTER_MS;
    if (attention && !stale) return null;
    this.held = null;
    return { item: h.item, card: stale };
  }

  clear() {
    this.held = null;
  }
}
