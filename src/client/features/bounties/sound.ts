// A payout as you hear it, on the Ship bus, in time with the coins' flight (flight.ts, logic.ts FLIGHT):
// a tink from the vault as each coin leaves, a rush of air that travels with them over the deck, a
// brighter tink at the console as each lands, and a soft chord once the last is in. Every part is placed
// where it happens, so from the conn you hear the tokens flow across the room. With less motion nothing
// flies, and the chord alone plays at the receipt.

import type { Recipe } from '../../sound';
import { bell, noise, rand } from '../../sound/dsp';
import { FLIGHT, flightTime, type P3 } from './logic';

/** How near (m) a payout plays at full level: it carries across the deck (the vault is on the west wall, the chair 18 m off). */
const REACH = 7;

/** The chord once the coins are in: C, E and G two octaves up, soft. */
export const PAID_CHORD = [1047, 1319, 1568] as const;

/** `n` coins from `from` to `to`; `still` plays only the chord, at `to`. */
export function payout(from: P3, to: P3, n: number, still: boolean): Recipe {
  return (ctx, out, a) => {
    const t0 = ctx.currentTime + 0.02;
    const end = still ? 0 : flightTime(n);
    const at = a.place(ctx, out, to, REACH);
    if (!still) {
      const vault = a.place(ctx, out, from, REACH);
      for (let i = 0; i < n; i++) {
        bell(ctx, vault, t0 + i * FLIGHT.gap, rand(2900, 3400), 0.07, 0.25);
        bell(ctx, at, t0 + i * FLIGHT.gap + FLIGHT.s, rand(2200, 2700), 0.085, 0.35);
      }
      // The rush of air, moving with the coins from the vault to the console.
      const p = a.place(ctx, out, from, REACH) as PannerNode;
      if (p.positionX) {
        for (const [param, a0, a1] of [
          [p.positionX, from.x, to.x],
          [p.positionY, from.y + FLIGHT.rise, to.y + FLIGHT.rise],
          [p.positionZ, from.z, to.z],
        ] as const) {
          param.setValueAtTime(a0, t0);
          param.linearRampToValueAtTime(a1, t0 + FLIGHT.s);
        }
      }
      const src = ctx.createBufferSource();
      src.buffer = noise(ctx);
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.6;
      bp.frequency.setValueAtTime(700, t0);
      bp.frequency.exponentialRampToValueAtTime(2600, t0 + FLIGHT.s * 0.5);
      bp.frequency.exponentialRampToValueAtTime(900, t0 + end);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.12, t0 + FLIGHT.s * 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + end);
      src.connect(bp).connect(g).connect(p);
      src.start(t0, Math.random());
      src.stop(t0 + end + 0.05);
    }
    // In: the chord, a little spread.
    PAID_CHORD.forEach((f, i) => bell(ctx, at, t0 + end + 0.05 + i * 0.045, f, 0.11, 1.4));
  };
}
