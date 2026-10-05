// Where the bridge's rituals stand (features/drive, features/turnaround), on the same plan as the deck in
// layout.ts: the drive core in the aft viewport, the fleet's tally on the situation wall, and the pit
// wall on the Review bay. Kept out of layout.ts, which is at its size budget.

import { ELEVATOR, FLOOR, MEETING_ROOM, MISSION_TABLE, SITUATION, facingTable } from './layout.js';

const round = (v: number) => Math.round(v * 1000) / 1000;

/**
 * The drive core: a reactor column rising out of the Deck lift's roof on the bridge's axis, framed by the
 * aft glass behind it (features/drive). It stands from `base` (the housing's roof) to `top`, under the
 * canopy; its stacked rings run from `y0` to `y1`, the lowest first. It is aft of the conn and clear of
 * every console, so no sightline crosses it.
 */
export const AFT_CORE = { x: ELEVATOR.x, z: round(FLOOR.maxZ - ELEVATOR.depth / 2), r: 0.8, base: 3.6, y0: 4.0, y1: 6.3, top: 6.75 } as const;

/**
 * The fleet's eight-week tally on the situation wall: a slim plaque over the Services panel, the
 * easternmost, facing the table like the panel under it (features/drive).
 */
export const TALLY = (() => {
  const a = SITUATION.angles[4];
  const x = round(MISSION_TABLE.x + Math.cos(a) * (SITUATION.r - 0.1));
  const z = round(MISSION_TABLE.z + SITUATION.cz + Math.sin(a) * (SITUATION.r - 0.1));
  return { x, y: SITUATION.top + 0.75, z, rotY: facingTable(x, z - SITUATION.cz) + Math.PI, width: 3.0, height: 0.9 };
})();

/**
 * The pit wall: the captain's turnaround clock on a mast over the Review bay's roof, high enough to
 * clear the Issues panel in front of the bay, turned toward the deck between the table and the conn
 * (features/turnaround). `roof` is where its mast stands.
 */
export const PIT_WALL = (() => {
  const x = round((MEETING_ROOM.minX + MEETING_ROOM.maxX) / 2);
  const z = round(MEETING_ROOM.front.z - 0.6);
  return { x, y: MEETING_ROOM.height + 2.75, z, rotY: Math.atan2(MISSION_TABLE.x - x, MISSION_TABLE.z + 4 - z), width: 4.2, height: 1.48, roof: MEETING_ROOM.height };
})();
