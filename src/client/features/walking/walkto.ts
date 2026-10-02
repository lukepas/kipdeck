// The way over to a teammate you clicked in the sidebar: round the furniture on the office floor (see
// shared/nav.ts).

import { FLOOR, inWing } from '../../../shared/layout';
import { route } from '../../../shared/nav';

export interface Spot {
  x: number;
  y: number;
  z: number;
}

/** On the office floor (its back office as far as it's built out too), where the office has a map to walk round. */
function onTheFloor(p: Spot, wing: number): boolean {
  if (p.y > -1 && p.y < 0.5 && inWing(p.x, p.z, wing)) return true;
  return p.y > -1 && p.x >= FLOOR.minX && p.x <= FLOOR.maxX && p.z >= FLOOR.minZ && p.z <= FLOOR.maxZ;
}

/**
 * The corners of a walk from `from` to `to`, `to` included when it's somewhere you can stand, on a
 * floor built out `wing` rows into the back office.
 */
export function wayTo(from: Spot, to: Spot, wing = 0): { x: number; z: number }[] {
  // Somewhere the office has no map of: straight there.
  if (!onTheFloor(from, wing) || !onTheFloor(to, wing)) return [{ x: to.x, z: to.z }];
  // Across the office floor; route stops at the nearest place to stand if they're in a chair or on the couch.
  return route([from.x, from.z], [to.x, to.z], wing)
    .slice(1)
    .map(([x, z]) => ({ x, z }));
}
