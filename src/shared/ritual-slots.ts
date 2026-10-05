// Where the bridge's rituals stand (features/drive, features/turnaround), on the same plan as the deck in
// layout.ts: the drive core in the aft viewport, the fleet's tally on the situation wall, and the pit
// wall on the Review bay. Kept out of layout.ts, which is at its size budget.

import { BOARDS, ELEVATOR, FLOOR, MEETING_ROOM, MISSION_TABLE, SITUATION } from './layout.js';

const round = (v: number) => Math.round(v * 1000) / 1000;

/**
 * The drive core: a reactor column rising out of the Deck lift's roof on the bridge's axis, framed by the
 * aft glass behind it (features/drive). It stands from `base` (the housing's roof) to `top`, under the
 * canopy; its stacked rings run from `y0` to `y1`, the lowest first. It is aft of the conn and clear of
 * every console, so no sightline crosses it.
 */
export const AFT_CORE = { x: ELEVATOR.x, z: round(FLOOR.maxZ - ELEVATOR.depth / 2), r: 0.8, base: 3.6, y0: 4.0, y1: 6.3, top: 6.75 } as const;

/**
 * The fleet's eight-week tally over the situation arc: a slim plaque over its starboard wing (Pull
 * requests over Services), turned toward the conn like the wing under it (features/drive).
 */
export const TALLY = (() => {
  const w = BOARDS.pulls;
  const back = 0.1;
  return { x: round(w.x - Math.sin(w.rotY) * back), y: round(SITUATION.top + 0.5), z: round(w.z - Math.cos(w.rotY) * back), rotY: w.rotY, width: 3.0, height: 0.6 };
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
