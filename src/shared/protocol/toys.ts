// The whiteboard on every floor.

import type { WbElement, WbPointer } from '../whiteboard.js';

export type WhiteboardClientMsg =
  /** You opened the whiteboard (or closed it): everyone on the floor sees who's drawing. */
  | { t: 'wb.open' }
  | { t: 'wb.close' }
  /** Elements you added or changed on the whiteboard; pictures go first, by POST /api/whiteboard/file. */
  | { t: 'wb.update'; elements: WbElement[] }
  /** Where your mouse is on the whiteboard, and what you have selected there. */
  | ({ t: 'wb.pointer'; selected?: string[] } & WbPointer);

export type ToysServerMsg =
  /** Someone changed these elements on the floor's whiteboard (sent to everyone else on the floor). */
  | { t: 'wb.update'; elements: WbElement[] }
  /** Who has the floor's whiteboard open now. */
  | { t: 'wb.people'; people: string[] }
  /** Someone's mouse on the whiteboard; only people who have it open get these. */
  | ({ t: 'wb.pointer'; id: string; selected?: string[] } & WbPointer);
