/**
 * Where you are, and putting you somewhere: in the elevator car, or on your feet at a spot; and where
 * you're standing, to come back to.
 */
import { ELEVATOR, ELEVATOR_CAR, FLOOR, POLE, WALL_HEIGHT, inElevator, inWing } from '../../shared/layout';
import type { Arrival } from '../features/climbing/controller';
import { rememberSpot, store, type Spot } from '../state';
import type { Ctx } from './context';
import type { CoreState } from './ctx';
import type { Parts } from './parts';

export function installPlace(ctx: Ctx, core: CoreState, parts: Pick<Parts, 'worlds' | 'seating' | 'climbing'>) {
  const { player } = ctx;

  /** In the car, facing out through the doors: where you are when you arrive on a floor. */
  function placeInCar(at?: { x: number; z: number }) {
    const spot = at && inElevator(at.x, at.z) ? at : { x: ELEVATOR.x, z: (ELEVATOR_CAR.minZ + ELEVATOR_CAR.maxZ) / 2 };
    placeAt({ x: spot.x, y: 0, z: spot.z, rotY: 0 });
  }

  /** Standing in the office on your floor, its back office as far as it's built out too: not in a shaft on the ladder or a pole. */
  function indoors(): boolean {
    const p = player.pos;
    if (p.y < -1 || p.y > WALL_HEIGHT) return false;
    return (p.x > FLOOR.minX && p.x < FLOOR.maxX && p.z > FLOOR.minZ && p.z < FLOOR.maxZ) || inWing(p.x, p.z, parts.worlds.officeWing());
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

  /** Where you're standing, to come back to (see lastSpot): nowhere while you're between floors, or climbing between them. */
  function spotHere(): Spot | null {
    if (!store.floor || core.trip || parts.climbing.climber.active) return null;
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
  function standingAt(): Arrival {
    return { x: player.pos.x, y: player.pos.y, z: player.pos.z, rotY: player.facing };
  }

  /** Arrived in a spot that's a pole's hole on this floor: step out of it, the way in. */
  function unstick() {
    const { office } = ctx;
    if (!office.stack.polesGoDown()) return;
    const p = player.pos;
    const spot = office.stack.poles().find((s) => Math.max(Math.abs(p.x - s.x), Math.abs(p.z - s.z)) <= POLE.rail + 0.35);
    if (!spot) return;
    const out = POLE.rail + 0.7;
    p.set(spot.x + Math.sin(spot.open) * out, Math.max(0, p.y), spot.z + Math.cos(spot.open) * out);
  }

  return { placeInCar, indoors, placeAt, spotHere, saveSpot, standingAt, unstick };
}
