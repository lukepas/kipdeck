/**
 * Every part of the office main.ts makes and installs, by name, for the parts that need one another.
 * Each is set as it's made (see the install list in main.ts) and read when something happens (a
 * message, a key, a frame), never while installing: so the order parts are installed in is only the
 * order they register in, and a part can reach one installed after it. Each part names the ones it
 * reaches for (a `Pick` of these). Types only.
 */
import type { Net } from '../net';
import type { DesktopNotifier } from '../notify';
import type { PlayerController } from '../player';
import type { OfficeSound } from '../sound';
import type { Settings } from '../state';
import type { Voice } from '../voice';
import type { Person } from '../world/character';
import type { Confetti } from '../world/confetti';
import type { installBoards } from '../features/boards';
import type { installBookshelf } from '../features/bookshelf';
import type { installCarrying } from '../features/carrying';
import type { installHud } from '../features/hud';
import type { installMeeting } from '../features/meeting';
import type { installPeers } from '../features/peers';
import type { installSeating } from '../features/seating';
import type { installTv } from '../features/tv';
import type { installVoice } from '../features/voice';
import type { installWaiting } from '../features/waiting';
import type { installWalking } from '../features/walking';
import type { installWorkerActions } from '../features/workers/actions';
import type { installWorkerViews } from '../features/workers/views';
import type { installFocus } from '../input/focus';
import type { installPointer } from '../input/pointer';
import type { installArrival } from './arrival';
import type { installHintBar } from './hintbar';
import type { installFloorWatch } from './floorwatch';
import type { installPlace } from './place';
import type { Stage } from './scene';
import type { installTravel } from './travel';
import type { createWorlds } from './worlds';
import type { installYou } from './you';

type Made<F extends (...args: never[]) => unknown> = ReturnType<F>;

export interface Parts {
  // ---- What the office is made of ------------------------------------------------------------------
  stage: Stage;
  /** The office as the workers know it, and its board agents (see core/worlds.ts). */
  worlds: Made<typeof createWorlds>;
  net: Net;
  voice: Voice;
  /** Your own character. */
  me: Person;
  settings: Settings;
  player: PlayerController;
  /** The system asks for less motion: no shaking the view, no swaying. */
  reduceMotion: MediaQueryList;
  sound: OfficeSound;
  /** Confetti for merges, landing on whatever it falls on. */
  confetti: Confetti;
  notifier: DesktopNotifier;

  // ---- The office's own parts ----------------------------------------------------------------------
  place: Made<typeof installPlace>;
  you: Made<typeof installYou>;
  travel: Made<typeof installTravel>;
  arrival: Made<typeof installArrival>;
  floorWatch: Made<typeof installFloorWatch>;
  hintbar: Made<typeof installHintBar>;
  focus: Made<typeof installFocus>;
  pointer: Made<typeof installPointer>;

  // ---- Features ------------------------------------------------------------------------------------
  boards: Made<typeof installBoards>;
  tv: Made<typeof installTv>;
  peers: Made<typeof installPeers>;
  walking: Made<typeof installWalking>;
  views: Made<typeof installWorkerViews>;
  actions: Made<typeof installWorkerActions>;
  waiting: Made<typeof installWaiting>;
  meeting: Made<typeof installMeeting>;
  bookshelf: Made<typeof installBookshelf>;
  cards: Made<typeof installCarrying>;
  seating: Made<typeof installSeating>;
  talk: Made<typeof installVoice>;
  hud: Made<typeof installHud>;
}
