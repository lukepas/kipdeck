/**
 * Space outside the bridge: the sky (the galactic band, its dust lanes, a nebula, crisp stars), three
 * layers of stars streaming past as the ship makes way north, now and then a planet, an asteroid
 * field or a comet going by off to the side, and two flourishes: a surge on a merge and a jump to new
 * space when a waypoint (a milestone) is reached. It all lives outside the glass, in neutrals and
 * ship-cyan only, and never moves the camera (DESIGN.md, rule 1).
 *
 * How fast the ship makes way is the one ambient cue tied to the deck: more merges in the last hour,
 * a little faster; no unit deployed, or all parked, and it holds station. Settings > Bridge > Ship
 * motion slows it all to half with no flybys and no streaks (Calm) or stills it (Off, as reduced
 * motion does), and a waypoint reached then only changes the view, a 400 ms crossfade. While a unit has
 * just started needing you or got stuck, the flybys dim and wait, and no surge plays. A jump widens
 * the view a few degrees and shifts the room's light cool going in and warm coming out; its flash is
 * a glint over the glass (a third by Night). Nothing plays while the tab is hidden: a merge then
 * surges nothing, and a waypoint only crossfades, so coming back is never met by a flourish out of nowhere.
 */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { DECK, VIEWPORT_GLASS } from '../../world/office/materials';
import { Flybys } from './flybys';
import { FOV } from '../../core/scene';
import { DUCK_MS, FIRST_FLYBY_MS, FLYBY_GAP_MS, JUMP_FOV, JUMP_MS, JUMP_STRETCH, MERGE_WINDOW_MS, SPACE_COLORS, SURGE, SURGE_GAP_MS, SURGE_MS, between, cruiseSpeed, flashPeak, jumpAt, jumpsNow, motionScale, pickFlyby, seeded, surgeAt, surgeGlint, surgesNow, type FlybyKind } from './logic';
import { Sky } from './sky';
import { Starfield } from './stars';

/** The fog in Walk: none inside the bridge, only what's far outside fades into space before the far plane. */
const FOG = { near: 70, far: 118 } as const;
/** How long a waypoint reached takes to change the view under reduced motion (ms). */
const FADE_MS = 400;
/** How far the stars streak in a surge, against their cruise length (the jump's is JUMP_STRETCH). */
const SURGE_STRETCH = 8;
/** How long the ship takes to settle on a new cruise speed (s). */
const EASE_S = 4;
/** The drive glow's breath: its period (ms) and depth. */
const BREATH = { ms: 8000, depth: 0.1 } as const;

export interface Space {
  /** Plays the merge surge now (the debug handle and the shots). */
  surge(): void;
  /** Plays the waypoint jump now. */
  jump(): void;
  /** Sends a flyby of `kind` by now, `at` (0-1) of the way through its pass, on `side` (-1 west, 1 east) or either. */
  flyby(kind: FlybyKind, at?: number, side?: -1 | 1): void;
  /** How fast the ship is making way now, times cruise. */
  speed(): number;
  /** Runs space's clock at `k` times real time (0 holds it): for the shots, to catch a flourish on its way. */
  timeScale(k: number): void;
  /** Space's own clock (ms), which only runs while frames do. */
  clock(): number;
}

export function installSpace(ctx: Ctx, parts: Pick<Parts, 'stage' | 'lights' | 'player'>): Space {
  const { scene } = parts.stage;
  scene.background = new THREE.Color(SPACE_COLORS.void);
  scene.fog = new THREE.Fog(SPACE_COLORS.void, FOG.near, FOG.far);
  const sky = new Sky(ctx.renderer);
  const stars = new Starfield();
  const flybys = new Flybys(ctx.renderer);
  scene.add(sky.mesh, stars.group, flybys.far, flybys.near);
  VIEWPORT_GLASS.emissive.set(DECK.ship);
  VIEWPORT_GLASS.emissiveIntensity = 0;

  const rand = seeded(0xf1b5);
  /** Space's own clock (ms): it only runs while frames do, so a hidden tab pauses everything. */
  let clock = 0;
  let cruise = cruiseSpeed(0, false);
  let speedNow = cruise;
  let underWay = false;
  let mergesLastHour = 0;
  const merges: number[] = [];
  let surgeFrom = -Infinity;
  let jump: { at: number; swapped: boolean } | null = null;
  let jumpWaiting = false;
  let fade: { at: number } | null = null;
  let regionN = 0;
  let duckUntil = -Infinity;
  let duck = 1;
  let nextFlyby = between(rand(), FIRST_FLYBY_MS);
  /** A flyby asked for by hand: it plays whatever Ship motion says. */
  let forced = false;
  let glint = 0;
  let timeK = 1;
  /** The view's widening and the room's tint the jump last set, to put back once it's over. */
  let fovNow = 0;
  let tintNow = 0;
  const was = new THREE.Vector3();
  let moving = false;

  const scale = () => motionScale(ctx.reduceMotion.ship);
  const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

  function surge() {
    if (jump || !surgesNow(ctx.reduceMotion.ship, visible())) return;
    if (clock - surgeFrom < SURGE_GAP_MS) return;
    surgeFrom = clock;
  }

  function startJump() {
    regionN++;
    sky.prepare(regionN);
    if (!jumpsNow(ctx.reduceMotion.ship, visible())) {
      fade = { at: clock };
      return;
    }
    // A jump outranks a surge; whatever was passing is left behind.
    surgeFrom = -Infinity;
    jump = { at: clock, swapped: false };
  }

  function waypoint() {
    // A jump waits for a unit that has just started needing you to be seen first.
    if (clock < duckUntil) jumpWaiting = true;
    else startJump();
  }

  // ---- What moves the ship: merges, waypoints, units deployed --------------------------------------
  ctx.messages.on('landed', (m) => {
    if (m.kind !== 'merged') return;
    const now = Date.now();
    merges.push(now);
    while (merges.length && now - merges[0] > MERGE_WINDOW_MS) merges.shift();
    if (clock >= duckUntil) surge();
  });

  let doneOn: { floor: string | null; done: Set<string> } | null = null;
  store.on('mission', () => {
    const done = new Set(store.mission.milestones.filter((m) => m.done).map((m) => m.id));
    const was = doneOn;
    doneOn = { floor: store.floor, done };
    if (!was || was.floor !== store.floor) return;
    if ([...done].some((id) => !was.done.has(id))) waypoint();
  });

  let lastCounts = { needs: 0, stuck: 0 };
  let readAt = -Infinity;
  function readDeck() {
    const c = store.counts();
    const all = c['needs-you'] + c.stuck + c.review + c.working + c.parked;
    underWay = all - c.parked > 0;
    // Something has just started needing you, or got stuck: ambient life gives way for a moment.
    if (c['needs-you'] > lastCounts.needs || c.stuck > lastCounts.stuck) duckUntil = clock + DUCK_MS;
    lastCounts = { needs: c['needs-you'], stuck: c.stuck };
    const now = Date.now();
    while (merges.length && now - merges[0] > MERGE_WINDOW_MS) merges.shift();
    // The timeline's merges too, as far as it has been loaded: a merge from before you came aboard counts.
    const logged = store.timeline.events.filter((e) => e.kind === 'pr-merged' && now - e.at < MERGE_WINDOW_MS).length;
    mergesLastHour = Math.max(merges.length, logged);
  }

  ctx.ticks.add('world', (frame) => {
    const dt = frame.dt * timeK;
    const ms = dt * 1000;
    clock += ms;
    if (clock - readAt > 1000) {
      readAt = clock;
      readDeck();
    }
    const k = scale();
    // Walking while the stars stream by is the strongest pull on the stomach: a surge runs at half then.
    moving = parts.player.pos.distanceTo(was) > 0.5 * dt;
    was.copy(parts.player.pos);
    cruise += (cruiseSpeed(mergesLastHour, underWay) - cruise) * Math.min(1, dt / EASE_S);
    if (jumpWaiting && clock >= duckUntil) {
      jumpWaiting = false;
      startJump();
    }

    // The flourishes: a surge's speed and streaks, or a jump's stretch, flash and new region.
    let mul = 1;
    let streak = 0;
    let stretch = 1;
    let flash = 0;
    let fov = 0;
    let tint = 0;
    glint = 0;
    const sinceSurge = clock - surgeFrom;
    if (sinceSurge < SURGE_MS) {
      mul = surgeAt(sinceSurge);
      if (moving) mul = 1 + (mul - 1) / 2;
      // At Calm a surge is only the glint on the glass: no streaks past the side ports.
      streak = k < 1 ? 0 : (mul - 1) / (SURGE.peak - 1);
      stretch = SURGE_STRETCH;
      glint = surgeGlint(sinceSurge);
    }
    if (jump) {
      const f = jumpAt(clock - jump.at);
      mul = f.speed;
      streak = f.streak;
      stretch = JUMP_STRETCH;
      flash = f.flash;
      fov = f.fov;
      tint = f.tint;
      if (f.swapped && !jump.swapped) {
        jump.swapped = true;
        sky.show(1);
        flybys.clear();
      }
      if (clock - jump.at >= JUMP_MS) jump = null;
    }
    if (fade) {
      const f = Math.min(1, (clock - fade.at) / FADE_MS);
      sky.show(f);
      if (f >= 1) fade = null;
    }

    speedNow = k === 0 ? 0 : cruise * k * mul;
    stars.step(dt, speedNow, k === 0 ? 0 : streak, stretch);
    sky.turn(dt * k);
    sky.setFlash(flash * flashPeak(parts.lights?.mode() ?? 'night', ctx.reduceMotion.ship));
    if (fov !== fovNow) {
      fovNow = fov;
      ctx.camera.fov = FOV + JUMP_FOV * fov;
      ctx.camera.updateProjectionMatrix();
    }
    if (tint !== tintNow) {
      tintNow = tint;
      parts.lights?.tint(tint);
    }
    VIEWPORT_GLASS.emissiveIntensity = 0.3 * glint;
    const breath = k === 0 ? 1 : 1 + BREATH.depth * Math.sin((clock / BREATH.ms) * Math.PI * 2);
    ctx.office.drive.set((cruise / 0.4) * 0.6 * breath * Math.sqrt(mul));

    // The flybys: one at a time, in Full only, never while a flourish plays or a unit has just started needing you.
    duck += ((clock < duckUntil ? 0.4 : 1) - duck) * Math.min(1, dt * 3);
    flybys.setGain(duck);
    if (flybys.current) {
      if (k < 1 && !forced) flybys.clear();
      else if (!flybys.step(dt, Math.max(0.4, cruise) * (forced ? 1 : k))) {
        forced = false;
        nextFlyby = clock + between(rand(), FLYBY_GAP_MS);
      }
    } else if (k === 1 && clock >= nextFlyby && clock >= duckUntil && !jump && sinceSurge >= SURGE_MS) {
      flybys.start(pickFlyby(rand()), rand);
    }
  });

  return {
    surge: () => {
      surgeFrom = -Infinity;
      surge();
    },
    jump: startJump,
    flyby: (kind, at = 0, side) => {
      forced = true;
      flybys.start(kind, rand, at, side);
    },
    speed: () => speedNow,
    timeScale: (k) => void (timeK = Math.max(0, k)),
    clock: () => clock,
  };
}
