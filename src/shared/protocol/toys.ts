// The toys on every floor: pictures, the jukebox, the arcade, the whiteboard and the ball.

import type { CabinetFrame, CabinetState } from '../cabinet.js';
import type { DecorPlacement, Decoration } from '../decor.js';
import type { BallState } from '../hoop.js';
import type { JukeboxState } from '../jukebox.js';
import type { WbElement, WbPointer } from '../whiteboard.js';

export type DecorClientMsg =
  /** Hang a picture on a wall. */
  | { t: 'decor.add'; decor: DecorPlacement }
  /** Move, resize, re-frame or swap the image of a picture. */
  | { t: 'decor.update'; id: string; decor: Partial<DecorPlacement> }
  | { t: 'decor.remove'; id: string };

export type JukeboxClientMsg =
  /** Put a tune on the jukebox (a JUKEBOX_TUNES id), or a stream; with neither, turn it back on. */
  | { t: 'jukebox.play'; track?: string; url?: string }
  /** On to the next tune. */
  | { t: 'jukebox.skip' }
  | { t: 'jukebox.stop' };

export type CabinetClientMsg =
  /**
   * Step up to the arcade cabinet on your floor to carry on with `game` (one the office started for
   * you), or to start a new game, even while you're at it; the office answers with `cabinet`, naming
   * who got it and their game.
   */
  | { t: 'cabinet.play'; game?: string }
  | { t: 'cabinet.leave' }
  /**
   * Your game as it looks now, for everyone else on the floor to watch over your shoulder. It's also
   * how your score gets on the high-score table: the office follows the game frame by frame.
   */
  | { t: 'cabinet.frame'; frame: CabinetFrame };

export type WhiteboardClientMsg =
  /** You opened the whiteboard (or closed it): everyone on the floor sees who's drawing. */
  | { t: 'wb.open' }
  | { t: 'wb.close' }
  /** Elements you added or changed on the whiteboard; pictures go first, by POST /api/whiteboard/file. */
  | { t: 'wb.update'; elements: WbElement[] }
  /** Where your mouse is on the whiteboard, and what you have selected there. */
  | ({ t: 'wb.pointer'; selected?: string[] } & WbPointer);

export type BallClientMsg =
  /** Pick up the floor's basketball (or catch it): yours if nobody else has it. */
  | { t: 'ball.take' }
  /** Throw the basketball in your hands from (x, y, z) at (vx, vy, vz) m/s, or drop it; everyone on the floor sees it fly. */
  | { t: 'ball.throw'; x: number; y: number; z: number; vx: number; vy: number; vz: number };

export type ToysServerMsg =
  | { t: 'decor'; items: Decoration[] }
  /** The basketball on your floor was picked up, thrown, or put back under the hoop. */
  | { t: 'ball'; ball: BallState }
  | { t: 'jukebox'; state: JukeboxState }
  /** Who's at the arcade cabinet on your floor now, and the building's high scores. */
  | { t: 'cabinet'; state: CabinetState }
  /** The game on your floor's cabinet, as its player sees it (sent to everyone else on the floor). */
  | { t: 'cabinet.frame'; frame: CabinetFrame }
  /** Someone changed these elements on the floor's whiteboard (sent to everyone else on the floor). */
  | { t: 'wb.update'; elements: WbElement[] }
  /** Who has the floor's whiteboard open now. */
  | { t: 'wb.people'; people: string[] }
  /** Someone's mouse on the whiteboard; only people who have it open get these. */
  | ({ t: 'wb.pointer'; id: string; selected?: string[] } & WbPointer);
