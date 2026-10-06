/**
 * Sitting down: the captain's chair, a lounge seat. Sitting there already, E gets you up (a lounge
 * seat's Esc too). A shared screen is watched with E at the Attention board itself (features/tv).
 */
import { seatPlace, type SeatDef, type SeatPlace } from '../../../shared/layout';
import { OFFICE_PLAN } from '../../../shared/plan';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { store } from '../../state';
import { toast } from '../../ui/dom';
import type { Interactable } from '../../world/types';

// The kinds of thing you can use that this defines (see InteractKinds in world/types.ts).
declare module '../../world/types' {
  interface InteractKinds {
    seat: true;
  }
}

export interface SeatingDeps {
  /** What you can use where you are, and what's in the way of looking at it (see usable in input/pointer.ts). */
  usable(): (readonly Interactable[])[];
}

export function installSeating(ctx: Ctx, deps: SeatingDeps) {
  /** The free place on a seat nearest you, or null when everyone else on your floor has taken them all. */
  function freePlace(seat: SeatDef): SeatPlace | null {
    const taken = new Set<string>();
    for (const p of store.peers.values()) if (p.seat && p.id !== store.you && store.onMyFloor(p)) taken.add(p.seat);
    let best: SeatPlace | null = null;
    let bestD = Infinity;
    const player = ctx.player;
    for (let i = 0; i < seat.places.length; i++) {
      const place = seatPlace(seat, i);
      const d = Math.hypot(place.x - player.pos.x, place.z - player.pos.z);
      if (!taken.has(place.key) && d < bestD) {
        best = place;
        bestD = d;
      }
    }
    return best;
  }

  /** E at a seat: sit down on it. Sitting there already, get up. */
  function useSeat(seatId: string) {
    const seat = OFFICE_PLAN.seatingById.get(seatId);
    if (!seat) return;
    const player = ctx.player;
    if (player.seat?.seatId === seatId) {
      standUp();
      return;
    }
    const place = freePlace(seat);
    if (!place) {
      toast(`No room on that ${seat.label.replace(/^\S+ /, '').toLowerCase()} right now`, 'warn');
      return;
    }
    player.sit(place);
    ctx.me.sit(place.hips);
    ctx.net.send({ t: 'sit', seat: place.key });
  }

  function standUp() {
    ctx.player.stand();
    gotUp();
  }
  ctx.messages.on('sit.refused', (msg) => {
    // Somebody on the floor got there first: back on your feet, next to them.
    if (ctx.player.seat?.key === msg.seat) {
      ctx.player.stand();
      // On your feet as far as everyone's concerned (the office still has you where you sat before).
      gotUp();
      toast(`${msg.by} got there first`, 'warn');
    }
  });

  /** On your feet again, by E or by walking off. */
  function gotUp() {
    ctx.me.sit(null);
    ctx.net.send({ t: 'sit' });
  }
  ctx.player.onStand = gotUp;

  /** What you're sitting on, so it's what E is about unless you're looking at something else. */
  function mySeat(): Interactable | null {
    const id = ctx.player.seat?.seatId;
    return (id && deps.usable()[0].find((it) => it.kind === 'seat' && it.seatId === id)) || null;
  }

  /** When you sat in the seat you're in (ms), so the captain's chair's hint can step back after a moment. */
  let sat = { id: '', at: 0 };
  ctx.interactions.define('seat', {
    reach: 3,
    hint: (it) => {
      const seat = OFFICE_PLAN.seatingById.get(it.seatId ?? '');
      if (!seat) return { k: '', parts: [] };
      if (ctx.player.seat?.seatId === seat.id) {
        if (sat.id !== seat.id) sat = { id: seat.id, at: performance.now() };
        // In the captain's chair the hint says where you are for 3 s, then only the key to get up: it
        // sat in the middle of the captain's frame the whole time.
        // A lounge seat (for the view out of the bow glass) steps back the same way, and Esc gets you up there too.
        const up = seat.view ? key('Esc', 'Stand up') : key('E', 'Get up');
        if ((seat.id === 'conn' || seat.view) && performance.now() - sat.at > 3000) return { k: `${seat.id}|sitting|quiet`, parts: [up] };
        return { k: `${seat.id}|sitting`, parts: [hintTitle(seat.label), aside('sitting'), up] };
      }
      sat = { id: '', at: 0 };
      const full = !freePlace(seat);
      return { k: `${seat.id}|${full}`, parts: [hintTitle(seat.label), full ? aside('no room') : key('E', 'Sit down')] };
    },
    use: onE((it) => {
      if (it.seatId) useSeat(it.seatId);
    }),
  });

  return { freePlace, standUp, mySeat };
}
