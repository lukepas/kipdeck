// The screens hung on the deck's walls beside its boards: the service monitor on the east wall and the
// Review bay's sign on its front glass. Pure numbers on the plan (layout.ts), which the client builds
// them from and the tests check against the ports, the hull frames and the captain's view.
import { FLOOR, MEETING_ROOM } from './layout.js';

/**
 * The service monitor: a screen flush on the east wall between the north-east port and the hull frame
 * by the Services board's side, facing the deck (`rotY` -PI/2 faces -x), where the live page of a
 * service a unit is running shows (features/monitor). `x` is its back on the wall; `width` and `height`
 * are its face, 16:10, whose middle is `y` over the floor.
 */
export const SERVICE_MONITOR = { x: FLOOR.maxX - 0.04, z: -7.67, y: 1.75, rotY: -Math.PI / 2, width: 1.4, height: 0.875 } as const;
/** How far the service monitor stands off the wall, its bezel and face included (m). */
export const SERVICE_MONITOR_DEPTH = 0.09;

/**
 * The Review bay's sign: a screen inside the bay's front glass, in the pane west of its door (the glass
 * there is two panes; this is the middle of the one by the door), facing the deck. Its far face is read
 * from the captain's chair, 25 m off: the line to it passes west of the Issues wing and its lectern and
 * over the units (features/boards/meeting.ts paints it as a table, its counts from afar).
 */
export const BAY_SIGN = { x: MEETING_ROOM.door.x0 - (MEETING_ROOM.door.x0 - MEETING_ROOM.minX) / 4, y: 1.75, z: MEETING_ROOM.front.z, width: 1.8, height: 1.0 } as const;
