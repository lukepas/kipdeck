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
import { zoomOf } from '../../core/zoom';
import { spectacleTarget } from '../giveway/logic';
import { BANNER_MS, DUCK_MS, FIRST_FLYBY_MS, FLEET_STAGGER_MS, FLYBY_GAP_MS, JUMP, JUMP_FOV, JUMP_HOLD_MS, JUMP_MS, JUMP_STRETCH, MERGE_WINDOW_MS, PUNCH_LIFT, SPACE_COLORS, SPACE_GIVE_WAY, SURGE, SURGE_GAP_MS, SURGE_HARD, SURGE_MS, between, countdownLeft, cruiseSpeed, flashPeak, jumpAt, jumpsNow, motionScale, pickFlyby, seeded, surgeAt, surgeGlint, surgesNow, spoolLevel, type FlybyKind } from './logic';
import { GLOW, JumpGlow, countdownGlow } from './jumpglow';
import { Banner, Tunnel } from './tunnel';
import { JUMP_READY, waypointBanner } from '../../../shared/shiplog';
import { Sky, clearOfGiant } from './sky';
import { Starfield } from './stars';
import { Meteors } from './meteors';
import { starScale } from '../giveway/logic';
import { debugHandle } from '../giveway';

/** The fog in Walk: none inside the bridge, only what's far outside fades into space before the far plane. */
const FOG = { near: 70, far: 118 } as const;
/** How long a waypoint reached takes to change the view under reduced motion (ms). */
const FADE_MS = 400;
/** How far the stars streak in a surge, against their cruise length (the jump's is JUMP_STRETCH). */
const SURGE_STRETCH = 8;
/** How long the sky takes to give way to attention, or to turn to Day (s). */
const YIELD_S = 0.5;
/** How long the ship takes to settle on a new cruise speed (s). */
const EASE_S = 4;
/** The drive glow's breath: its period (ms) and depth. */
const BREATH = { ms: 8000, depth: 0.1 } as const;

/** The waypoint a jump makes for: its place, its title, and whether it is the mission's last. */
export interface Waypoint {
  n: number;
  title: string;
  final: boolean;
}

/**
 * The light space throws into the room now (features/atmos): a passing planet's wash off a side port,
 * a comet's or meteor's glint, each with the way to it from the ship and its colour, and the jump's
 * flash (0-1, none where the jump's flash doesn't play).
 */
export interface OutsideLight {
  wash: number;
  washDir: THREE.Vector3;
  washColor: THREE.Color;
  glint: number;
  glintDir: THREE.Vector3;
  flash: number;
}

/** Where a jump is: none under way, waiting for the captain, counting down, or jumping. */
export type JumpPhase = 'idle' | 'held' | 'countdown' | 'jump';

export interface Space {
  /** Plays the merge surge now (the debug handle and the shots). */
  surge(): void;
  /** A streak's surge (Tier 2, features/moments): harder than a merge's, whatever the gap since the last. */
  surgeHard(): void;
  /** Reaches a waypoint now: the countdown, the jump and the name after it (the shots), or the crossfade where it can't play. */
  jump(to?: Waypoint): void;
  /** Where a jump is now. */
  phase(): JumpPhase;
  /** Sends a meteor across the sky now (the debug handle and the clips). */
  meteor(): void;
  /** Sends a flyby of `kind` by now, `at` (0-1) of the way through its pass, on `side` (-1 west, 1 east) or either. */
  flyby(kind: FlybyKind, at?: number, side?: -1 | 1): void;
  /** How fast the ship is making way now, times cruise. */
  speed(): number;
  /** How open the jump's tunnel is now (0-1 of the light mode's cap): what is out ahead dims behind it. */
  tunnelOpen(): number;
  /** Runs space's clock at `k` times real time (0 holds it): for the shots, to catch a flourish on its way. */
  timeScale(k: number): void;
  /** Space's own clock (ms), which only runs while frames do. */
  clock(): number;
  /** The light space throws into the room now: a planet's wash, a comet's or meteor's glint, the jump's flash. */
  outside(): OutsideLight;
  /** Which region of sky is showing (sky.ts region()), and how far it has turned round the ship. */
  sky(): { region: number; angle: number };
  /** The countdown before a jump while it runs: the seconds left (3, 2, 1) and where to; null otherwise. */
  countdown(): { left: number; to: Waypoint } | null;
  /** The waypoint the jump under way (or held) makes for, or null. */
  heading(): Waypoint | null;
  /** Lifts the whole sky `k` times (1 at rest): the mission complete. */
  brighten(k: number): void;
}

export function installSpace(ctx: Ctx, parts: Pick<Parts, 'stage' | 'lights' | 'player' | 'giveWay' | 'alert' | 'fleet' | 'quality'>): Space {
  const { scene } = parts.stage;
  scene.background = new THREE.Color(SPACE_COLORS.void);
  scene.fog = new THREE.Fog(SPACE_COLORS.void, FOG.near, FOG.far);
  const sky = new Sky(ctx.renderer, ctx.office.holo.boards);
  const stars = new Starfield();
  const flybys = new Flybys(ctx.renderer);
  const tunnel = new Tunnel();
  const banner = new Banner();
  const glow = new JumpGlow();
  scene.add(sky.mesh, stars.group, flybys.far, flybys.near, tunnel.mesh, banner.mesh);
  // Settings > Bridge > Quality: Low streams two of the star layers, the others all three.
  parts.quality.on((_, look) => void (stars.moving = look.starLayers));
  VIEWPORT_GLASS.emissive.set(DECK.ship);
  VIEWPORT_GLASS.emissiveIntensity = 0;

  const rand = seeded(0xf1b5);
  /** Bakes the next region's sky while nothing else is going on, ready for the next waypoint. */
  const bakeAhead = () => {
    const idle = (window as { requestIdleCallback?: (fn: () => void) => void }).requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 500));
    idle(() => sky.prepare(regionN + 1));
  };
  const meteors = new Meteors(seeded(0x3e7e));
  scene.add(meteors.group);
  /** Space's own clock (ms): it only runs while frames do, so a hidden tab pauses everything. */
  let clock = 0;
  let cruise = cruiseSpeed(0, false);
  let speedNow = cruise;
  let underWay = false;
  let mergesLastHour = 0;
  const merges: number[] = [];
  let surgeFrom = -Infinity;
  let surgePeak: number = SURGE.peak;
  let jump: { at: number; swapped: boolean; to: Waypoint; rejoined: boolean; punched: boolean } | null = null;
  /** A waypoint reached that hasn't jumped yet: held for the captain, or counting down from `countAt`. */
  let pending: { to: Waypoint; at: number; countAt: number | null } | null = null;
  let bannerAt = -Infinity;
  /** The second the countdown shows across the glass, while it runs. */
  let counting = 0;
  let bandSays: string | null = null;
  /** How open the tunnel was last frame (the destination dims behind it). */
  let openNow = 0;
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
  let flashNow = 0;
  /** How bright the nebula's knots are (1, SPACE_GIVE_WAY while something needs the captain), and how far toward Day the sky is. */
  let knots = 1;
  let dayNow = 0;
  const outside: OutsideLight = { wash: 0, washDir: new THREE.Vector3(), washColor: new THREE.Color(), glint: 0, glintDir: new THREE.Vector3(), flash: 0 };
  const glintColor = new THREE.Color();

  // Silent running (Settings > Bridge > Life) slows space to a crawl: no streaks, flybys or meteors.
  const scale = () => motionScale(ctx.reduceMotion.ship) * starScale(ctx.settings.life);
  const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

  function surge() {
    if (jump || pending?.countAt != null || !surgesNow(ctx.reduceMotion.ship, visible())) return;
    if (clock - surgeFrom < SURGE_GAP_MS) return;
    surgeFrom = clock;
    surgePeak = SURGE.peak;
    ctx.sound.jump('surge');
  }

  /**
   * The band under the overhead strip (features/alert): the countdown. A jump waiting for the captain
   * is said once, as the JUMP READY chip on the Attention board's header (features/tv), not on the band.
   */
  function say(text: string | null) {
    if (text === bandSays) return;
    bandSays = text;
    parts.alert?.say('jump', text === JUMP_READY ? null : text);
  }

  function showBanner(to: Waypoint) {
    banner.write(waypointBanner(to));
    bannerAt = clock;
  }

  /** The waypoint without the flourish: the new space crossfades in over 400 ms, its name over the glass, the escorts in their slots. */
  function crossfade(to: Waypoint) {
    counting = 0;
    regionN++;
    sky.prepare(regionN);
    fade = { at: clock };
    jump = null;
    pending = null;
    say(null);
    parts.fleet?.rejoin(0);
    showBanner(to);
  }

  function startJump(to: Waypoint) {
    regionN++;
    sky.prepare(regionN);
    // A jump outranks a surge; whatever was passing is left behind.
    surgeFrom = -Infinity;
    jump = { at: clock, swapped: false, to, rejoined: false, punched: false };
    parts.fleet?.jumpOut(FLEET_STAGGER_MS);
    ctx.sound.jump('release');
  }

  /** A waypoint reached: a countdown and the jump where it can play, held while anyone needs the captain; else the crossfade. */
  function waypoint(to: Waypoint) {
    if (!jumpsNow(ctx.reduceMotion.ship, visible(), ctx.settings.life)) return crossfade(to);
    pending = { to, at: clock, countAt: null };
  }

  /** Each frame: a held jump waits for the captain (2 minutes at most), then counts down; a call mid-way cuts it to the crossfade. */
  function conduct() {
    const calls = parts.giveWay?.attention() ?? false;
    if (jump && calls) {
      // A call came in mid-jump: out of the tunnel at once, into the new space by a crossfade.
      const to = jump.to;
      if (jump.swapped) {
        jump = null;
        parts.fleet?.rejoin(0);
        showBanner(to);
      } else {
        regionN--;
        crossfade(to);
      }
      return;
    }
    if (!pending) return;
    if (pending.countAt === null) {
      // Clear of calls, and the bridge stood down (its CONDITION GREEN said) first.
      if (!calls && !parts.alert?.settling()) pending.countAt = clock;
      else if (!calls) return say(null);
      else if (clock - pending.at >= JUMP_HOLD_MS) return crossfade(pending.to);
      else return say(JUMP_READY);
    }
    if (calls) return crossfade(pending.to);
    // The spool-up: the drive's sound (with sound on) once, as the count starts.
    if (clock - pending.countAt < 1) ctx.sound.jump('spool');
    const left = countdownLeft(clock - pending.countAt);
    if (left > 0) {
      // Said once, on the kinetic type plane over the bow (features/kinetic): never on the band or the sky too.
      counting = left;
      return say(null);
    }
    const to = pending.to;
    pending = null;
    counting = 0;
    say(null);
    startJump(to);
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
    const ms = store.mission.milestones;
    const done = new Set(ms.filter((m) => m.done).map((m) => m.id));
    const was = doneOn;
    doneOn = { floor: store.floor, done };
    if (!was || was.floor !== store.floor) {
      pending = null;
      say(null);
      return;
    }
    if (![...done].some((id) => !was.done.has(id))) return;
    const next = ms.find((m) => !m.done);
    waypoint(next ? { n: ms.indexOf(next) + 1, title: next.title, final: false } : { n: ms.length, title: store.mission.statement || ms[ms.length - 1]?.title || 'the mission', final: true });
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
    // The sky's own give way and its Day, on real time (not space's clock, which the shots hold).
    const ease = Math.min(1, frame.dt / YIELD_S);
    knots += ((parts.giveWay ? spectacleTarget(parts.giveWay.attention(), parts.giveWay.callAge(), SPACE_GIVE_WAY) : 1) - knots) * ease;
    sky.setDim(knots);
    dayNow += ((parts.lights?.mode() === 'day' ? 1 : 0) - dayNow) * ease;
    sky.setDay(dayNow);
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
    conduct();

    // The flourishes: a surge's speed and streaks, or a jump's stretch, flash and new region.
    let mul = 1;
    let streak = 0;
    let stretch = 1;
    let flash = 0;
    let fov = 0;
    let tint = 0;
    glint = 0;
    const sinceSurge = clock - surgeFrom;
    let open = 0;
    let punch = 0;
    // The room's light and the HUD's glow through the jump's three beats: spool-up, punch, arrival.
    let room = 1;
    let rim = 0;
    if (pending?.countAt != null) {
      room = spoolLevel(clock - pending.countAt);
      rim = countdownGlow(clock - pending.countAt);
    }
    if (sinceSurge < SURGE_MS) {
      mul = surgeAt(sinceSurge, surgePeak);
      if (moving) mul = 1 + (mul - 1) / 2;
      // At Calm a surge is only the glint on the glass: no streaks past the side ports.
      streak = k < 1 ? 0 : Math.min(1, (mul - 1) / (SURGE.peak - 1));
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
      open = f.tunnel;
      punch = f.punch;
      room = f.room;
      rim = GLOW.punch * f.punch;
      // Out of the tunnel: the escorts drop back into their slots, the waypoint's name across the glass.
      // The punch lands with the flash (jump.ts).
      if (!jump.punched && clock - jump.at >= JUMP.stretch) {
        jump.punched = true;
        ctx.sound.jump('punch');
      }
      if (!jump.rejoined && clock - jump.at >= JUMP.stretch + JUMP.flash + JUMP.tunnel) {
        jump.rejoined = true;
        ctx.sound.jump('arrival');
        parts.fleet?.rejoin(FLEET_STAGGER_MS);
        showBanner(jump.to);
      }
      if (f.swapped && !jump.swapped) {
        jump.swapped = true;
        sky.show(1);
        flybys.clear();
        meteors.clear();
      }
      if (clock - jump.at >= JUMP_MS) {
        jump = null;
        bakeAhead();
      }
    }
    const peak = flashPeak(parts.lights?.mode() ?? 'night', ctx.reduceMotion.ship);
    // The punch lifts the tunnel past the flash's cap for its first 0.6 s, then it settles back.
    tunnel.set(open * peak * (1 + PUNCH_LIFT * punch), dt);
    parts.lights?.level(peak > 0 ? room : 1);
    flashNow = peak > 0 ? Math.max(flash, punch) : 0;
    glow.set(peak > 0 ? rim : 0);
    // The waypoint's name: up in 300 ms, held, gone over the last 500 ms (a 400 ms crossfade with motion off, as the view's).
    const sinceBanner = clock - bannerAt;
    const still = ctx.reduceMotion.matches;
    if (counting) banner.show(0);
    else banner.show(sinceBanner >= BANNER_MS ? 0 : Math.min(1, sinceBanner / (still ? 400 : 300), (BANNER_MS - sinceBanner) / (still ? 400 : 500)));
    openNow = open * peak;
    if (fade) {
      const f = Math.min(1, (clock - fade.at) / FADE_MS);
      sky.show(f);
      if (f >= 1) {
        fade = null;
        bakeAhead();
      }
    }

    speedNow = k === 0 ? 0 : cruise * k * mul;
    stars.step(dt, speedNow, k === 0 ? 0 : streak, stretch);
    sky.turn(dt * k);
    sky.setFlash(flash * peak);
    if (fov !== fovNow) {
      fovNow = fov;
      zoomOf(ctx.camera).set('jump', JUMP_FOV * fov);
    }
    if (tint !== tintNow) {
      tintNow = tint;
      parts.lights?.tint(tint);
    }
    VIEWPORT_GLASS.emissiveIntensity = 0.3 * glint;
    const breath = k === 0 ? 1 : 1 + BREATH.depth * Math.sin((clock / BREATH.ms) * Math.PI * 2);
    ctx.office.drive.set((cruise / 0.4) * 0.6 * breath * Math.sqrt(mul));

    // A meteor now and then, at Full only, never while a flourish plays or a unit has just started needing you.
    if (k === 1) meteors.step(ms, clock >= duckUntil && !jump && sinceSurge >= SURGE_MS);
    else meteors.clear();

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
      // A planet keeps to the side the region's giant isn't on (features/vista).
      const kind = pickFlyby(rand());
      flybys.start(kind, rand, 0, kind === 'planet' ? clearOfGiant(regionN) : undefined);
    }
  });

  bakeAhead();
  // For the perf probe: the sky's bake, to time a region's cube cold.
  debugHandle('sky', sky);

  return {
    surge: () => {
      surgeFrom = -Infinity;
      surge();
    },
    surgeHard: () => {
      if (jump || !surgesNow(ctx.reduceMotion.ship, visible())) return;
      surgeFrom = clock;
      surgePeak = SURGE_HARD;
    },
    jump: (to = { n: regionN + 2, title: 'Billing v2', final: false }) => waypoint(to),
    phase: () => (jump ? 'jump' : pending ? (pending.countAt === null ? 'held' : 'countdown') : 'idle'),
    meteor: () => meteors.fire(),
    flyby: (kind, at = 0, side) => {
      forced = true;
      flybys.start(kind, rand, at, side);
    },
    speed: () => speedNow,
    tunnelOpen: () => openNow,
    timeScale: (k) => void (timeK = Math.max(0, k)),
    clock: () => clock,
    sky: () => sky.view(),
    countdown: () => (pending?.countAt != null && counting > 0 ? { left: counting, to: pending.to } : null),
    heading: () => jump?.to ?? pending?.to ?? null,
    brighten: (k) => sky.setBoost(k),
    outside: () => {
      const o = outside;
      o.flash = flashNow;
      o.wash = 0;
      o.glint = 0;
      const k = flybys.current === 'planet' ? flybys.light(o.washDir, o.washColor) : 0;
      if (k > 0) o.wash = k;
      else if (flybys.current === 'comet') o.glint = flybys.light(o.glintDir, glintColor);
      if (o.glint <= 0) o.glint = meteors.light(o.glintDir);
      return o;
    },
  };
}
