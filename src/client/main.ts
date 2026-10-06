import './style.css';
import { Net } from './net';
import { DesktopNotifier } from './notify';
import { AVATAR_COLORS, store, loadProfile, loadSettings, saveProfile } from './state';
import { randomLook } from '../shared/avatar';
import { PlayerController } from './player';
import { Voice } from './voice';
import { $ } from './ui/dom';
import { askName } from './ui/name';
import { elevatorPanelOpen } from './ui/elevator';
import { onModelsProgress, preloadModels } from './world/models';
import { loadingScreen } from './ui/loading';
import { offerLite, touchOnly } from './ui/litesuggest';
import { createCtx } from './core/ctx';
import type { Parts } from './core/parts';
import { createScene, fitWindow, makeRenderer, noWebGL } from './core/scene';
import { installOverview } from './core/camera-overview';
import { installFlight } from './core/flight';
import { createWorlds } from './core/worlds';
import { frameLoop, installLoop } from './core/loop';
import { installPlace } from './core/place';
import { installYou, makeMe, makeSound } from './core/you';
import { installTravel } from './core/travel';
import { installArrival } from './core/arrival';
import { installFloorWatch } from './core/floorwatch';
import { installHintBar } from './core/hintbar';
import { installKeyboard, installKeyGuards } from './input/keyboard';
import { installFocus } from './input/focus';
import { installPointer } from './input/pointer';
import { installBoards } from './features/boards';
import { installBookshelf } from './features/bookshelf';
import { installCarrying } from './features/carrying';
import { installChat } from './features/chat';
import { installCounters } from './features/counters';
import { installLanded } from './features/landed';
import { installBounties } from './features/bounties';
import { installBeats } from './features/beats';
import { installPods } from './features/pods';
import { installProofCorner } from './features/proofcorner';
import { installReadyLine } from './features/readyline';
import { installBridge } from './features/bridge';
import { installSpace } from './features/space';
import { installDictation } from './features/dictation';
import { installHud } from './features/hud';
import { installMeeting } from './features/meeting';
import { installMission } from './features/mission';
import { installNeedsYou } from './features/needsyou';
import { installPalette } from './features/palette';
import { installPeers } from './features/peers';
import { installSeating } from './features/seating';
import { installTv } from './features/tv';
import { installArcChrome } from './features/arcchrome';
import { installSignals } from './features/signals';
import { installSpotlight } from './features/spotlight';
import { installVoice } from './features/voice';
import { installWaiting } from './features/waiting';
import { installWalking } from './features/walking';
import { installWhiteboard } from './features/whiteboard';
import { installMonitor } from './features/monitor';
import { installWorkerActions } from './features/workers/actions';
import { installWorkerViews } from './features/workers/views';
import { installDeclutter } from './features/workers/declutter';
import { installBoardFaces } from './features/boardfaces';
import { installFocusLean } from './features/focuslean';
import { installAmphitheater } from './features/amphitheater';
import { installSeatFrame } from './features/seatframe';
import { installPulse } from './features/pulse';
import { installDemo } from './features/demo';
import { installBottomBar } from './features/bottombar';
import { makeMotion } from './motion';
import { installLights } from './features/lights';
import { installQuality } from './features/quality';
import { installMerge } from './features/merge';
import { installIbl } from './features/ibl';
import { installAtmos } from './features/atmos';
import { installRelay } from './features/relay';
import { installVista } from './features/vista';
import { installCinema } from './features/cinema';
import { installLife } from './features/life';
import { installGiveWay } from './features/giveway';
import { installDestination } from './features/destination';
import { installFleet } from './features/fleet';
import { installSorties } from './features/sorties';
import { installVesper } from './features/vesper';
import { installCrew } from './features/crew';
import { installDroid } from './features/droid';
import { installMascot } from './features/mascot';
import { installAlert } from './features/alert';
import { installMoments } from './features/moments';
import { installDrive } from './features/drive';
import { installTurnaround } from './features/turnaround';
import { installLaunch } from './features/launch';
import { installPosture } from './features/posture';
import { installHoloUi } from './features/holoui';
import { installTakeConn } from './features/takeconn';
import { installHail } from './features/hail';
import { installKinetic } from './features/kinetic';
import { installHands } from './features/hands';
import { installLounge } from './features/lounge';
import { installSoundscape } from './features/soundscape';

// The loading screen stays up until there's an office to see (see boot and whoami at the end).
const loading = loadingScreen(onModelsProgress);
// Came here from the 2D view's 3D button: it isn't offered straight back.
const chose3d = new URLSearchParams(location.search).has('3d');
if (chose3d) history.replaceState(null, '', location.pathname);
/** Offers the 2D view (/lite) where the 3D is hard going. */
const offer2d = (why: 'touch' | 'slow') => chose3d || offerLite(why);
// A phone can't walk around the office: the 2D view is made for it.
if (touchOnly()) offer2d('touch');
// The models made in Blender, loaded before the world they're in is built (see world/models.ts).
await preloadModels();

// ---- The context every part of the office plugs into (see core/context.ts) ----------------------------
// Built before the parts it hands out, which are there by the time anything asks for them. Every part
// below goes into `parts` as it's made; one reaches another's only when something happens, so the
// order here is the order they register in: messages, keys, ticks, store topics and listeners run in
// that order, and it's kept on purpose.
const parts = {} as Parts;
const { ctx, core } = createCtx(parts);
// The office's own parts of each frame, before anything else's.
installLoop(ctx, parts, { offer2d });

// ---- Renderer & scene ---------------------------------------------------------------------------
const canvas = $('scene') as HTMLCanvasElement;
parts.stage = createScene(canvas, makeRenderer(canvas) ?? (await noWebGL()));
parts.worlds = createWorlds(ctx);

// ---- The install list ---------------------------------------------------------------------------
parts.boards = installBoards(ctx, {
  aimedNote: () => parts.pointer.aimedNote(),
  pickUp: (it) => parts.cards.pickUp(it),
  boardActions: () => parts.actions.boardActions(),
  showQueue: () => parts.waiting.showQueue(),
  aimHit: () => parts.pointer.aimHit(),
  watchService: (port) => parts.monitor.show(port),
});
installWhiteboard(ctx);
// Onto whatever you're walking on: the office's floor and furniture.
parts.tv = installTv(ctx, { shares: () => parts.talk.currentShares(), watch: () => parts.talk.watchShare(), jumpReady: () => parts.space?.phase() === 'held' });

// You, and how you talk to the office.
parts.net = new Net(() => store.profile, () => parts.arrival.whereNow());
parts.voice = new Voice(parts.net);
parts.me = makeMe(ctx);
parts.settings = loadSettings();
parts.player = new PlayerController(ctx.camera, canvas, ctx.office.colliders);
installKeyGuards(ctx, parts);
parts.place = installPlace(ctx, core, parts);
// Everyone arrives on the conn, facing the bow (the welcome says exactly where across it).
parts.place.placeOnConn();
parts.player.view = parts.settings.view;
parts.you = installYou(ctx);
parts.reduceMotion = makeMotion(() => parts.settings.shipMotion);
parts.sound = makeSound(parts.settings);

parts.notifier = new DesktopNotifier(() => parts.settings.notify, (id) => parts.waiting.answerWorker(id));
const reach = () => parts.you.reach();

parts.travel = installTravel(ctx, core, parts);
parts.arrival = installArrival(ctx, core, parts);
parts.floorWatch = installFloorWatch(ctx);
parts.peers = installPeers(ctx, parts);
parts.walking = installWalking(ctx, core, parts);
parts.views = installWorkerViews(ctx, parts);
parts.actions = installWorkerActions(ctx, parts);
parts.waiting = installWaiting(ctx, core, parts);
parts.mission = installMission(ctx, parts);
parts.needsYou = installNeedsYou(ctx, parts);
installCounters(ctx, parts);
installPalette(ctx, parts);
parts.meeting = installMeeting(ctx, parts);
parts.bookshelf = installBookshelf(ctx);

parts.cards = installCarrying(ctx, {
  hold: (card) => void (core.carrying = card),
  boards: parts.boards,
  aimedNote: () => parts.pointer.aimedNote(),
  reach,
  hire: parts.actions.hire,
  officeIsFull: parts.actions.officeIsFull,
  showMeeting: parts.meeting.showMeeting,
});
parts.seating = installSeating(ctx, { usable: () => parts.pointer.usable() });
installLanded(ctx, { notifier: parts.notifier, ritual: () => parts.launch?.ritual() ?? null });
installBounties(ctx, parts);
installPods(ctx);
parts.proofCorner = installProofCorner(ctx);
installBeats(ctx, parts);
installReadyLine(ctx, parts);
installBridge(ctx, parts);
// Before what draws more or less with it (the glow, the sky's light, the floor's gloss, the stars).
parts.quality = installQuality(ctx, parts);
parts.space = installSpace(ctx, parts);
parts.lights = installLights(ctx, parts);
installLife(ctx, parts);
parts.giveWay = installGiveWay(ctx);
installDestination(ctx, parts);
parts.fleet = installFleet(ctx, parts);
installSorties(ctx, parts);
parts.vesper = installVesper(ctx, parts);
parts.crew = installCrew(ctx, parts);
parts.droid = installDroid(ctx, parts);
// Kip, the bridge mascot: after Bolt, whose errands he follows.
installMascot(ctx, parts);
// Before the moments: its pose comes off first each frame, as it is laid last (after their gestures).
installPosture(ctx, parts);
parts.alert = installAlert(ctx, parts);
// What the deck's surfaces reflect: the room's own light inside, the sky's on the hull.
installIbl(ctx, parts);
// The light round the deck: shafts, dust, haze, pools, the canopy's ribs and light from outside.
installAtmos(ctx, parts);
// Space close by: dust streaming past the ports, a giant off one side, the sun's flare through the canopy.
installVista(ctx, parts);
// The Relay Beacon off the starboard bow: the fleet's relay station, its rings carrying the units at work.
installRelay(ctx, parts);
// How the bridge is shot: the arrival, the breathing at the conn, the moments' framing, the screens' character and the grade.
parts.cinema = installCinema(ctx, parts);
installMoments(ctx, parts);
parts.drive = installDrive(ctx, parts);
parts.turnaround = installTurnaround(ctx, parts);

parts.hintbar = installHintBar(ctx, core, parts);
installKeyboard(ctx, parts);
parts.focus = installFocus(ctx, core, parts);
parts.pointer = installPointer(ctx, core, parts);
parts.overview = installOverview(ctx, parts);
parts.flight = installFlight(ctx);
parts.boardFaces = installBoardFaces(ctx, parts);
installAmphitheater(ctx, parts);
installSeatFrame(ctx, parts);
installArcChrome(ctx, parts);
// The diamond, the triangle, the ring and the pip over the units, and the beams up to their cards.
installSignals(ctx, parts);
installSpotlight(ctx, parts);
// The motion layer over the room: the arc's faces in motion (the build, the scan, the sweeps, the
// cards' effects, the warp's fold); taking the conn (the rise, the tiers lit pit to dais, the arc built
// in) and the gold chase; the attention beats (a hail, a stuck unit, one gone to review); and the set
// pieces over the bow (the kinetic type, the mission complete, the Night and Day iris).
parts.holoUi = installHoloUi(ctx, parts);
parts.takeConn = installTakeConn(ctx, parts);
parts.hail = installHail(ctx, parts);
installKinetic(ctx, parts);
// The bridge's pulse at rest: the wave down the canopy's ribs, the halo's glint, the wake over the glass.
installPulse(ctx, parts);
installFocusLean(ctx, parts);
// The forward lounge at the bow: its ladder's climb and its seats' view (features/lounge).
parts.lounge = installLounge(ctx, parts);
// The service monitor on the east wall: a unit's web server's live page (features/monitor).
parts.monitor = installMonitor(ctx, parts);
// Your gloved hands in first person, drawn over the deck (features/hands).
installHands(ctx, parts);
// What you hear besides the cues: your steps, Bolt, the interface and the bridge's ambience (features/soundscape).
installSoundscape(ctx, parts);
installDeclutter(ctx, parts);
installDemo(ctx, parts);
installChat(ctx);
parts.talk = installVoice(ctx, { tv: parts.tv });
installDictation(ctx);
parts.hud = installHud(ctx, parts);
installBottomBar(ctx, parts);
parts.launch = installLaunch(ctx, parts);
// Last: the deck's static meshes merged into a few draws, once everything above has built its own.
installMerge(ctx);

// ---- Main loop ---------------------------------------------------------------------------------------
fitWindow(ctx);
const frame = frameLoop(ctx, loading);

// ---- Boot ------------------------------------------------------------------------------------------
function boot() {
  parts.net.connect();
  requestAnimationFrame(frame);
}

/** Who you're signed in as. With an account of your own, your name is that account's. */
async function whoami() {
  try {
    const res = await fetch('/api/whoami', { cache: 'no-store' });
    if (res.status === 401) location.href = '/login';
    const { me } = (await res.json()) as { me?: typeof store.me };
    if (me) store.me = me;
  } catch {
    // the welcome message says it too
  }
}

void whoami().then(() => {
  const saved = loadProfile();
  if (saved && store.me.account) saved.name = store.me.account.name;
  if (store.me.account) store.profile.name = store.me.account.name;
  store.emit('me');
  const enter = () => {
    parts.you.showMyProfile(store.profile);
    boot();
    // In as soon as the floor you're on is here, so its workers don't pop in after.
    const welcomed = new Promise<void>((resolve) => {
      const off = store.on('floor', () => {
        off();
        resolve();
      });
    });
    loading.until([
      { say: 'Signing in', done: welcomed },
    ]);
  };
  if (saved?.look) {
    store.profile = { ...saved, look: saved.look };
    return enter();
  }
  // New here: no character to pick before you see the office. A look and a shirt are dealt at
  // random (Settings > Your character changes them), and only a name is asked for: none with an
  // account, or when the 2D view already has one.
  store.profile = {
    name: saved?.name ?? store.profile.name,
    color: saved?.color ?? AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    look: randomLook(),
  };
  if (saved || store.me.account) {
    saveProfile(store.profile);
    return enter();
  }
  askName((name) => {
    store.profile.name = name;
    saveProfile(store.profile);
    enter();
  });
});

// Debug handle for quick checks from the console / headless screenshots.
const { worlds, views } = parts;
(window as any).__office = { world: () => worlds.world(), store, player: parts.player, camera: ctx.camera, workerViews: views.workerViews, departures: views.departures, arrivals: views.arrivals, scene: ctx.scene, net: parts.net, renderer: ctx.renderer, me: parts.me, remotes: parts.peers.remotes, settings: parts.settings, office: ctx.office, overview: parts.overview, space: parts.space, lights: parts.lights, quality: parts.quality, stage: parts.stage, switchFloor: parts.travel.switchFloor, elevatorPanelOpen, carried: () => core.carrying };
(window as any).__voice = parts.voice;
(window as any).__sound = parts.sound;
(window as any).__notify = parts.notifier;
