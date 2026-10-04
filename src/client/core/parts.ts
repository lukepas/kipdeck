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
import type { DeckSound } from '../sound';
import type { Settings } from '../state';
import type { Voice } from '../voice';
import type { Person } from '../world/character';
import type { installBoards } from '../features/boards';
import type { installBookshelf } from '../features/bookshelf';
import type { installCarrying } from '../features/carrying';
import type { installHud } from '../features/hud';
import type { installMeeting } from '../features/meeting';
import type { installMission } from '../features/mission';
import type { installNeedsYou } from '../features/needsyou';
import type { installPeers } from '../features/peers';
import type { installProofCorner } from '../features/proofcorner';
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
import type { installOverview } from './camera-overview';
import type { installFlight } from './flight';
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
  sound: DeckSound;
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
  /** The Overview camera over the whole deck (see core/camera-overview.ts). */
  overview: Made<typeof installOverview>;
  /** The view flying to where the office just put you, in Walk (see core/flight.ts). */
  flight: Made<typeof installFlight>;

  // ---- Features ------------------------------------------------------------------------------------
  boards: Made<typeof installBoards>;
  tv: Made<typeof installTv>;
  peers: Made<typeof installPeers>;
  walking: Made<typeof installWalking>;
  views: Made<typeof installWorkerViews>;
  actions: Made<typeof installWorkerActions>;
  waiting: Made<typeof installWaiting>;
  /** Mission control and the mission strip (see features/mission). */
  mission: Made<typeof installMission>;
  /** The beacon over a worker that needs you, the banner, the flash and the alarm (see features/needsyou). */
  needsYou: Made<typeof installNeedsYou>;
  meeting: Made<typeof installMeeting>;
  bookshelf: Made<typeof installBookshelf>;
  cards: Made<typeof installCarrying>;
  seating: Made<typeof installSeating>;
  talk: Made<typeof installVoice>;
  hud: Made<typeof installHud>;
  /** The rail, the vault and the plinth keeping up with the chain (see features/proofcorner). */
  proofCorner: Made<typeof installProofCorner>;
}
