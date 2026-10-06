// The screens hung on the deck's walls beside its boards: the Review bay's sign on its front glass. Pure numbers on the plan (layout.ts), which the client builds
// them from and the tests check against the ports, the hull frames and the captain's view.
import { MEETING_ROOM } from './layout.js';

/**
 * The Review bay's sign: a screen inside the bay's front glass, in the pane west of its door (the glass
 * there is two panes; this is the middle of the one by the door), facing the deck. Its far face is read
 * from the captain's chair, 25 m off: the line to it passes west of the Issues wing and its lectern and
 * over the units (features/boards/meeting.ts paints it as a table, its counts from afar).
 */
export const BAY_SIGN = { x: MEETING_ROOM.door.x0 - (MEETING_ROOM.door.x0 - MEETING_ROOM.minX) / 4, y: 1.75, z: MEETING_ROOM.front.z, width: 1.8, height: 1.0 } as const;
