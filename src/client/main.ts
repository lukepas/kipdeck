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
import { installLanded } from './features/landed';
import { installHud } from './features/hud';
import { installMeeting } from './features/meeting';
import { installMission } from './features/mission';
import { installPalette } from './features/palette';
import { installPeers } from './features/peers';
import { installSeating } from './features/seating';
import { installTv } from './features/tv';
import { installVoice } from './features/voice';
import { installWaiting } from './features/waiting';
import { installWalking } from './features/walking';
import { installWhiteboard } from './features/whiteboard';
import { installWorkerActions } from './features/workers/actions';
import { installWorkerViews } from './features/workers/views';

// The loading screen stays up until there's an office to see (see boot and whoami at the end).
const loading = loadingScreen(onModelsProgress);
// Came here from the 2D view's 🏢 3D button: it isn't offered straight back.
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
parts.boards = installBoards(ctx, { aimedNote: () => parts.pointer.aimedNote(), pickUp: (it) => parts.cards.pickUp(it), boardActions: () => parts.actions.boardActions(), showQueue: () => parts.waiting.showQueue() });
installWhiteboard(ctx);
// Onto whatever you're walking on: the office's floor and furniture.
parts.tv = installTv(ctx, { shares: () => parts.talk.currentShares(), watch: () => parts.talk.watchShare() });

// You, and how you talk to the office.
parts.net = new Net(() => store.profile, () => parts.arrival.whereNow());
parts.voice = new Voice(parts.net);
parts.me = makeMe(ctx);
parts.settings = loadSettings();
parts.player = new PlayerController(ctx.camera, canvas, ctx.office.colliders);
installKeyGuards(ctx, parts);
parts.place = installPlace(ctx, core, parts);
// Everyone arrives in the elevator car (the welcome says exactly where).
parts.place.placeInCar();
parts.player.view = parts.settings.view;
parts.you = installYou(ctx);
parts.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
parts.sound = makeSound(parts.settings);

parts.notifier = new DesktopNotifier(() => parts.settings.notify, (id) => parts.waiting.openWorkerTerminal(id));
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
parts.seating = installSeating(ctx, { shares: () => parts.talk.currentShares(), watchShare: () => parts.talk.watchShare(), usable: () => parts.pointer.usable() });
installLanded(ctx, { notifier: parts.notifier });

parts.hintbar = installHintBar(ctx, core, parts);
installKeyboard(ctx, parts);
parts.focus = installFocus(ctx, core, parts);
parts.pointer = installPointer(ctx, core, parts);
installChat(ctx);
parts.talk = installVoice(ctx, { tv: parts.tv });
parts.hud = installHud(ctx, parts);

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
      { say: 'Knocking on the door', done: welcomed },
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
(window as any).__office = { world: () => worlds.world(), store, player: parts.player, camera: ctx.camera, workerViews: views.workerViews, departures: views.departures, arrivals: views.arrivals, scene: ctx.scene, net: parts.net, renderer: ctx.renderer, me: parts.me, remotes: parts.peers.remotes, settings: parts.settings, office: ctx.office, switchFloor: parts.travel.switchFloor, elevatorPanelOpen, carried: () => core.carrying };
(window as any).__voice = parts.voice;
(window as any).__sound = parts.sound;
(window as any).__notify = parts.notifier;
