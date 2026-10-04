/**
 * Where you are, and putting you somewhere: on the conn, or on your feet at a spot; and where
 * you're standing, to come back to.
 */
import { CONN, ELEVATOR, ELEVATOR_YAW, inElevator } from '../../shared/layout';
import { rememberSpot, store, type Spot } from '../state';
import type { Ctx } from './context';
import type { CoreState } from './ctx';
import type { Parts } from './parts';

export function installPlace(ctx: Ctx, core: CoreState, parts: Pick<Parts, 'seating'>) {
  const { player } = ctx;

  /**
   * On the conn behind the captain's chair, facing the bow: where you are when you arrive on a floor,
   * the table, the Attention board and the forward viewport in front of you. The office puts arrivals
   * in the Deck lift's car, a little apart; that spread is kept across the dais.
   */
  function placeOnConn(at?: { x: number; z: number }) {
    const spread = at && inElevator(at.x, at.z) ? Math.max(-0.5, Math.min(0.5, at.x - ELEVATOR.x)) : 0;
    placeAt({ x: CONN.x + spread, y: CONN.h, z: CONN.z + CONN.r * 0.72, rotY: ELEVATOR_YAW });
  }

  /** On your feet at `at`, facing `rotY` and looking straight ahead. */
  function placeAt(at: { x: number; y: number; z: number; rotY: number }) {
    if (player.seat) parts.seating.standUp();
    player.pos.set(at.x, at.y, at.z);
    player.vy = 0;
    player.facing = at.rotY;
    player.camYaw = player.facing - Math.PI;
    player.lookPitch = -0.08;
  }

  /** Where you're standing, to come back to (see lastSpot): nowhere while you're between floors. */
  function spotHere(): Spot | null {
    if (!store.floor || core.trip) return null;
    // Sitting, it's where you'd get up to.
    const at = player.standingSpot() ?? player.pos;
    const name = store.currentFloor()?.name ?? '';
    return { floor: store.floor, name, x: at.x, y: at.y, z: at.z, facing: player.facing };
  }

  function saveSpot() {
    const s = spotHere();
    if (s) rememberSpot(s);
  }

  /** Where you are, to arrive at the same spot on another floor. */
  function standingAt(): { x: number; y: number; z: number; rotY: number } {
    return { x: player.pos.x, y: player.pos.y, z: player.pos.z, rotY: player.facing };
  }

  return { placeOnConn, placeAt, spotHere, saveSpot, standingAt };
}
