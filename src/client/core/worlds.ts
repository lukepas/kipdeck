/**
 * The office as a world (see world/world.ts): what workers walk round and sit in, and the board agents
 * waiting by their boards in it.
 */
import { groundAt } from '../player';
import { store } from '../state';
import { officeWorld } from '../world/world';
import type { Ctx } from './context';
import { idleAgentsIn } from './stations';

/** The office's world and its board agents. Needs ctx.office (and ctx.player) made. */
export function createWorlds(ctx: Ctx) {
  const { office } = ctx;
  const world = officeWorld(office, () => office.stack.state.index > 0, () => officeWing());
  /** The board agents waiting at the office's kiosks. */
  const idleAgents = idleAgentsIn(world);

  /** How many rows the office's back office is built out on the floor you're on. */
  function officeWing(): number {
    return store.floorPlan.wing;
  }

  /** The top of whatever's underfoot at (x, z) for feet at `y`: its floor, a step, the street. */
  const groundHere = (x: number, z: number, y: number) => Math.max(groundAt(world.colliders, x, z, y), ctx.player.street);

  return {
    world: () => world,
    /** The board agents waiting by their boards. */
    idleAgents: () => idleAgents,
    officeWing,
    groundHere,
  };
}
