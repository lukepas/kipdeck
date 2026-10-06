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
import type { Motion } from '../motion';
import type { Voice } from '../voice';
import type { Person } from '../world/character';
import type { installBoards } from '../features/boards';
import type { installBoardFaces } from '../features/boardfaces';
import type { installBookshelf } from '../features/bookshelf';
import type { installCarrying } from '../features/carrying';
import type { installHud } from '../features/hud';
import type { installMeeting } from '../features/meeting';
import type { installMission } from '../features/mission';
import type { installNeedsYou } from '../features/needsyou';
import type { installPeers } from '../features/peers';
import type { installProofCorner } from '../features/proofcorner';
import type { installSeating } from '../features/seating';
import type { installLounge } from '../features/lounge';
import type { installSpace } from '../features/space';
import type { installLights } from '../features/lights';
import type { installQuality } from '../features/quality';
import type { installGiveWay } from '../features/giveway';
import type { installVesper } from '../features/vesper';
import type { installCrew } from '../features/crew';
import type { installDroid } from '../features/droid';
import type { installCinema } from '../features/cinema';
import type { installFleet } from '../features/fleet';
import type { installAlert } from '../features/alert';
import type { installDrive } from '../features/drive';
import type { installLaunch } from '../features/launch';
import type { installTurnaround } from '../features/turnaround';
import type { installTv } from '../features/tv';
import type { installHoloUi } from '../features/holoui';
import type { installTakeConn } from '../features/takeconn';
import type { installHail } from '../features/hail';
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
  reduceMotion: Motion;
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
  /** The wall boards' faces on screen each frame, for what keeps out of their way (see features/boardfaces). */
  boardFaces: Made<typeof installBoardFaces>;
  tv: Made<typeof installTv>;
  peers: Made<typeof installPeers>;
  walking: Made<typeof installWalking>;
  views: Made<typeof installWorkerViews>;
  actions: Made<typeof installWorkerActions>;
  waiting: Made<typeof installWaiting>;
  /** Mission control and the mission strip (see features/mission). */
  mission: Made<typeof installMission>;
  /** The banner over a worker that needs you, the flash and the alarm (see features/needsyou). */
  needsYou: Made<typeof installNeedsYou>;
  meeting: Made<typeof installMeeting>;
  bookshelf: Made<typeof installBookshelf>;
  cards: Made<typeof installCarrying>;
  seating: Made<typeof installSeating>;
  /** The forward lounge: its ladder's climb and its seats' view (features/lounge). */
  lounge: Made<typeof installLounge>;
  talk: Made<typeof installVoice>;
  hud: Made<typeof installHud>;
  /** The rail, the vault and the plinth keeping up with the chain (see features/proofcorner). */
  proofCorner: Made<typeof installProofCorner>;
  /** Space outside the glass: the sky, the stars, the flybys, the surge and the jump (see features/space). */
  space: Made<typeof installSpace>;
  /** Settings > Bridge > Quality: the tier the deck draws at, Auto's or yours (see features/quality). */
  quality: Made<typeof installQuality>;
  /** The bridge's lights: Night, Day or Auto, and Brightness (see features/lights). */
  lights: Made<typeof installLights>;
  /** Life giving way to attention, and Settings > Bridge > Life (see features/giveway). */
  giveWay: Made<typeof installGiveWay>;
  /** VESPER, the ship's mind: its lines for the ticker and the caption, and for a card's subtitle (see features/vesper). */
  vesper: Made<typeof installVesper>;
  /** Crew dossiers on the deck: epithets, chevrons and the unit of the watch (see features/crew). */
  crew: Made<typeof installCrew>;
  /** How the bridge is shot: the arrival, the breathing, the moments' framing, the screens and the grade (see features/cinema). */
  cinema: Made<typeof installCinema>;
  /** Bolt, the bridge droid (see features/droid). */
  droid: Made<typeof installDroid>;
  /** The fleet in formation: every other deck as an escort (see features/fleet). */
  fleet: Made<typeof installFleet>;
  /** Alert conditions and the band under the overhead strip (see features/alert). */
  alert: Made<typeof installAlert>;
  /** The drive core: the run of merges, the fleet's week and its record (see features/drive). */
  drive: Made<typeof installDrive>;
  /** The pit wall: the captain's turnaround clock in the Review bay (see features/turnaround). */
  turnaround: Made<typeof installTurnaround>;
  /** The start of watch: the launch and the debrief (see features/launch). */
  launch: Made<typeof installLaunch>;
  /** The arc's faces in motion: the build, the scan, the sweeps, the cards' effects, the warp's fold (see features/holoui). */
  holoUi: Made<typeof installHoloUi>;
  /** Taking the conn, and the gold chase up the tiers (see features/takeconn). */
  takeConn: Made<typeof installTakeConn>;
  /** The attention beats: a hail, a stuck unit, a unit gone to review (see features/hail). */
  hail: Made<typeof installHail>;
}
