/**
 * Giving way: the one signal every part of the bridge's world (the destination ahead, the fleet, the
 * squadron) reads to stay out of the way of what needs you, and Settings > Deck > Life with it.
 *
 * Once a second it reads this deck's ranking (shared/attention.ts): a unit that has just started
 * needing you or got stuck ducks all life for 3 s; its pod stays hushed while it lasts; and while
 * anyone on the deck waits on you, everything runs a quarter quieter. Set pieces wait their turn
 * behind it (HeldPieces in logic.ts). Nothing here draws anything.
 */
import { podOf, SEATS } from '../../../shared/layout';
import type { Ctx } from '../../core/context';
import { store, type LifeLevel, type LifePart } from '../../state';
import { GIVE_WAY, ambientMotion, lifeAllows, lifeGain, type LifeAct } from './logic';

export interface GiveWay {
  /** Settings > Deck > Life: Full, Calm or Silent running. */
  level(): LifeLevel;
  /** Whether `part` is switched on under Life. */
  wants(part: LifePart): boolean;
  /** Whether Life lets `act` play now. */
  allows(act: LifeAct): boolean;
  /** How fast ambient motion runs now (0 holds it still: Ship motion Off, reduced motion or Silent running). */
  motion(): number;
  /** Whether everything holds still: Ship motion Off or the system's reduced motion. */
  frozen(): boolean;
  /** How loud ambient life is now (0-1), eased: ducked for a moment after a new call, quieter while anyone waits. */
  gain(): number;
  /** Whether a unit on this deck needs you or is stuck right now. */
  attention(): boolean;
  /** Whether a unit has just started needing you or got stuck (the 3 s duck). */
  ducking(): boolean;
  /** How long ago (ms) a unit last started needing you or got stuck; Infinity before any has on this deck. */
  callAge(): number;
  /** Whether the pod (A to D, or a seat id off the pods) has a unit that needs you or is stuck. */
  hushed(pod: string): boolean;
  /** Whether the page is in view. */
  visible(): boolean;
}

/** Puts a part of the bridge's world on `window.__world` by name, for quick checks from the console and the shots. */
export function debugHandle(name: string, part: unknown) {
  const w = window as unknown as { __world?: Record<string, unknown> };
  (w.__world ??= {})[name] = part;
}

/** Which pod a seat is in, or the seat itself when it isn't in one (the overflow bay, the bean bags). */
export const podKey = (deskId: string) => podOf(deskId) ?? deskId;

export function installGiveWay(ctx: Ctx): GiveWay {
  let clock = 0;
  let readAt = -Infinity;
  let duckUntil = -Infinity;
  let callAt = -Infinity;
  let last = { needs: 0, stuck: 0 };
  /** Whether this deck has been read once: arriving where units already wait is no news, nothing to duck for. */
  let primed = false;
  let waiting = false;
  let calls = false;
  let gain = 1;
  const hushed = new Set<string>();
  const seats = new Set(SEATS.map((d) => d.id));

  function read() {
    let needs = 0;
    let stuck = 0;
    hushed.clear();
    for (const r of store.ranked(store.floor)) {
      if (r.att.snoozed) continue;
      const l = r.att.level;
      if (l !== 'needs-you' && l !== 'stuck') continue;
      if (l === 'needs-you') needs++;
      else stuck++;
      if (seats.has(r.entry.deskId)) hushed.add(podKey(r.entry.deskId));
    }
    if (primed && (needs > last.needs || stuck > last.stuck)) {
      duckUntil = clock + GIVE_WAY.duckMs;
      callAt = clock;
    }
    primed = store.floor !== null;
    last = { needs, stuck };
    waiting = needs > 0;
    calls = needs + stuck > 0;
  }
  store.on('roster', () => {
    read();
    readAt = clock;
  });
  store.on('floor', () => {
    primed = false;
    duckUntil = -Infinity;
    callAt = -Infinity;
    read();
  });

  ctx.ticks.add('world', ({ dt }) => {
    clock += dt * 1000;
    if (clock - readAt >= 1000) {
      readAt = clock;
      read();
    }
    const target = lifeGain({ ducking: clock < duckUntil, waiting });
    gain += (target - gain) * Math.min(1, dt * 3);
  });

  const giveWay: GiveWay = {
    level: () => ctx.settings.life,
    wants: (part) => ctx.settings.lifeParts[part],
    allows: (act) => lifeAllows(ctx.settings.life, act),
    motion: () => ambientMotion(ctx.settings.life, ctx.reduceMotion.ship),
    frozen: () => ctx.reduceMotion.matches,
    gain: () => gain,
    attention: () => calls,
    ducking: () => clock < duckUntil,
    callAge: () => clock - callAt,
    hushed: (pod) => hushed.has(pod),
    visible: () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  };
  debugHandle('giveWay', giveWay);
  return giveWay;
}
