/**
 * The Overview: an orthographic camera over the whole deck at 48 degrees, a little off the axis on its
 * starboard side so the dais, the tiers, the pit and the arc facing it read as one plan; the demo shot and where
 * "fly to unit" lands. G goes up into it and back down to Walk (first person). The way up and the way
 * down are one 650 ms move (core/overview-transition.ts): from your eyes, rising and closing its field
 * of view onto the Overview's framing, handed to the orthographic camera on the frame where the two draw
 * the same picture; input is held for it, and with less motion it cuts. In it, Q and E turn the deck a
 * quarter at a time (280 ms), W A S D or the arrows or a drag pan, the wheel zooms, and Esc or G walks
 * again. Left alone for 8 s it drifts by half a degree and a hand's width, so the shot stays alive. A
 * window opened over it closes back to it, with no extra click. Which of the two you start in is
 * features/homeview's.
 */
import './camera-overview.css';
import * as THREE from 'three';
import { FLOOR } from '../../shared/layout';
import { h, modalOpen } from '../ui/dom';
import type { Ctx } from './context';
import type { Parts } from './parts';
import { OVERVIEW_PITCH, SIDE_YAW, framePose, framedPoints } from './overview-frame';
import { FLY_MS, TRANSITION_MS, blendProjection, driftAt, easeInOutCubic, fovAlong, fovForHalfHeight, morphAt, zoomTierOf, type Drift, type ZoomTier } from './overview-transition';

/** How the camera looks down, how far back it stands, and how much of the deck fills the screen's height at zoom 1. */
const PITCH = OVERVIEW_PITCH;
const DIST = 80;
const HALF_HEIGHT = 16;
const ZOOM = { min: 0.75, max: 3.2, fly: 2 } as const;
/** How long a quarter turn takes (ms), and how fast the keys pan (m/s at zoom 1). */
const TURN_MS = 280;
const PAN_SPEED = 14;
/** The orthographic camera's depth range, which the move's blend shares. */
const NEAR = 0.1;
const FAR = 400;
const PAN_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};
const STILL: Drift = { yaw: 0, x: 0, z: 0 };

export interface Overview {
  readonly camera: THREE.OrthographicCamera;
  /** Up (or on the way up or down): the deck is drawn from above, and Walk's controls are put down. */
  active(): boolean;
  /** Whether the 650 ms move up or down is under way. */
  moving(): boolean;
  /** Up into the Overview, or back down to Walk. */
  toggle(on?: boolean): void;
  /** Pans and zooms to (x, z) in 650 ms (a cut under reduced motion), going up into the Overview first. Never zooms out. */
  flyTo(x: number, z: number): void;
  /** Turns slowly round the table at `speed` (radians a second) until you turn, pan or zoom yourself; 0 stops it. Demo mode's shot (features/demo). */
  orbit(speed: number): void;
  /** How close the Overview is: the whole deck, a pod, or a unit (for modules that show more up close). */
  zoomTier(): ZoomTier;
  /** Calls `fn` with where you're going each time you go up or down (features/homeview remembers it). */
  onChange(fn: (on: boolean) => void): () => void;
}

export function installOverview(ctx: Ctx, parts: Pick<Parts, 'stage'>): Overview {
  const { player, canvas } = ctx;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, NEAR, FAR);
  // A little north of the table: the top bar and the alert strip cover the top of the screen.
  const target = new THREE.Vector3(0, 0, -1);
  let on = false;
  let yaw = 0;
  let zoom = 1;
  const framed = framedPoints();
  /**
   * The framed pose every trip up starts from: from the starboard quarter, the dais, the tiers, the pit
   * and every board of the arc in the upper part of the screen (core/overview-frame.ts).
   */
  function frame() {
    const pose = framePose(framed, PITCH, window.innerWidth / Math.max(1, window.innerHeight), HALF_HEIGHT, ZOOM.max, SIDE_YAW);
    yaw = SIDE_YAW;
    turn = null;
    fly = null;
    drift = STILL;
    target.set(pose.x, 0, pose.z);
    zoom = THREE.MathUtils.clamp(pose.zoom, ZOOM.min, ZOOM.max);
  }
  let turn: { from: number; to: number; at: number } | null = null;
  let fly: { from: THREE.Vector3; to: THREE.Vector3; z0: number; z1: number; at: number } | null = null;
  const held = new Set<string>();
  let walkFog: THREE.Fog | THREE.FogExp2 | null = null;
  /** The slow turn round the table (radians a second), or 0. */
  let orbitSpeed = 0;
  const listeners = new Set<(on: boolean) => void>();

  // ---- The move between Walk and the Overview ---------------------------------------------------------
  /** The camera the move is drawn with: your eyes' perspective, closing onto the Overview's framing. */
  const moveCam = new THREE.PerspectiveCamera(60, 1, NEAR, FAR);
  const moveFog = new THREE.Fog(0x000000, 1, 2);
  let move: { up: boolean; at: number; eye: THREE.Vector3; q: THREE.Quaternion; fov: number; look: { yaw: number; pitch: number } } | null = null;
  /** A toggle asked for during the move, taken once it lands. */
  let pending: { want: boolean; fly?: [number, number] } | null = null;

  // ---- The idle drift ---------------------------------------------------------------------------------
  let inputAt = performance.now();
  let drift: Drift = STILL;
  /** Your input: the drift folds into where the view is (so nothing jumps) and waits another 8 s. */
  function touch() {
    yaw += drift.yaw;
    target.x += drift.x;
    target.z += drift.z;
    drift = STILL;
    inputAt = performance.now();
  }

  const legend = h(
    'div.overview-legend.hidden',
    { 'aria-hidden': 'true' },
    h('b', {}, 'OVERVIEW'),
    h('span', {}, h('kbd', {}, 'Q'), h('kbd', {}, 'E'), ' turn'),
    h('span', {}, h('kbd', {}, 'WASD'), ' pan'),
    h('span', {}, 'wheel zoom'),
    h('span', {}, h('kbd', {}, 'G'), ' walk'),
  );
  document.body.append(legend);
  /** The legend fades in once the view has landed up here (150 ms, camera-overview.css), and goes at once on the way down. */
  function showLegend(yes: boolean) {
    legend.classList.toggle('hidden', !yes);
    legend.classList.remove('in');
    if (yes) requestAnimationFrame(() => legend.classList.add('in'));
  }

  /** Up here: the Overview's camera, its fog, the legend. */
  function landUp() {
    parts.stage.view = camera;
    if (walkFog instanceof THREE.Fog) parts.stage.scene.fog = new THREE.Fog(walkFog.color, DIST + 12, DIST + 70);
    showLegend(true);
    inputAt = performance.now();
  }

  /** Back in Walk: your eyes, Walk's fog, and (from a key) the mouse back for looking around. */
  function landDown(lockNow: boolean) {
    on = false;
    parts.stage.view = null;
    parts.stage.scene.fog = walkFog;
    player.enabled = !modalOpen();
    // A key press is a gesture: the browser lets the page take the mouse back for first person.
    if (lockNow && player.enabled && player.view === 'first' && player.canLock) player.lock();
    document.body.classList.toggle('overview', false);
    ctx.hint.invalidate();
  }

  function toggle(want = !on) {
    if (move) {
      // Held while the view is moving: the last ask is taken once it lands.
      pending = want === move.up ? null : { want };
      return;
    }
    if (want === on) return;
    for (const fn of listeners) fn(want);
    const still = ctx.reduceMotion.matches;
    if (want) {
      on = true;
      frame();
      player.unlock();
      player.clearKeys();
      player.enabled = false;
      // The fog is measured from the camera, which stands far back up here.
      walkFog = parts.stage.scene.fog;
      document.body.classList.toggle('overview', true);
      ctx.hint.invalidate();
      if (still) landUp();
      else startMove(true);
      return;
    }
    held.clear();
    fly = null;
    orbitSpeed = 0;
    touch();
    showLegend(false);
    if (still) return landDown(true);
    // The mouse is taken now, while the key that asked is still a gesture; the move holds your look still.
    player.enabled = !modalOpen();
    if (player.enabled && player.view === 'first' && player.canLock) player.lock();
    startMove(false);
  }

  function startMove(up: boolean) {
    const eye = ctx.camera;
    move = { up, at: performance.now(), eye: eye.position.clone(), q: eye.quaternion.clone(), fov: eye.fov, look: { yaw: player.camYaw, pitch: player.lookPitch } };
    moveCam.layers.mask = camera.layers.mask;
    if (walkFog instanceof THREE.Fog) {
      moveFog.color.copy(walkFog.color);
      parts.stage.scene.fog = moveFog;
    }
    parts.stage.view = moveCam;
  }

  const eyePos = new THREE.Vector3();
  const eyeQ = new THREE.Quaternion();
  const look = new THREE.Vector3();
  const lookQ = new THREE.Quaternion();
  const aim = new THREE.Matrix4();
  /**
   * Places moveCam `k` of the way (0 your eyes, 1 the Overview), once the Overview's own camera is placed
   * for this frame looking at `at`. It keeps looking at a point that slides from where your eyes look (as
   * far off as the target) onto the target, so the deck stays in the frame the whole way.
   */
  function placeMove(k: number, aspect: number, at: THREE.Vector3) {
    if (!move) return;
    // Up, from where your eyes were; down, onto where they are now (held still by the 'pre' tick).
    eyePos.copy(move.up ? move.eye : ctx.camera.position);
    eyeQ.copy(move.up ? move.q : ctx.camera.quaternion);
    const eyeFov = move.up ? move.fov : ctx.camera.fov;
    moveCam.position.lerpVectors(eyePos, camera.position, k);
    look.set(0, 0, -1).applyQuaternion(eyeQ).multiplyScalar(eyePos.distanceTo(at)).add(eyePos).lerp(at, k);
    lookQ.setFromRotationMatrix(aim.lookAt(moveCam.position, look, moveCam.up));
    // Your eyes' own turn (a breath's roll included) for the first stretch, so the first frame is theirs.
    moveCam.quaternion.slerpQuaternions(eyeQ, lookQ, Math.min(1, k / 0.15));
    if (k >= 1) moveCam.quaternion.copy(camera.quaternion);
    const hh = HALF_HEIGHT / zoom;
    moveCam.fov = fovAlong(eyeFov, fovForHalfHeight(hh, DIST), k);
    moveCam.aspect = aspect;
    moveCam.updateProjectionMatrix();
    const m = morphAt(k);
    if (m > 0) {
      blendProjection(moveCam.projectionMatrix.elements, camera.projectionMatrix.elements, m, moveCam.projectionMatrix.elements);
      moveCam.projectionMatrixInverse.copy(moveCam.projectionMatrix).invert();
    }
    moveCam.updateMatrixWorld();
    moveCam.layers.mask = camera.layers.mask;
    if (walkFog instanceof THREE.Fog) {
      moveFog.near = walkFog.near + (DIST + 12 - walkFog.near) * k;
      moveFog.far = walkFog.far + (DIST + 70 - walkFog.far) * k;
    }
    // What sizes the units' marks (features/workers) reads the Overview's frame: the move's own, at the target.
    const seen = moveCam.position.distanceTo(target) * Math.tan(THREE.MathUtils.degToRad(moveCam.fov / 2)) * (1 - m) + hh * m;
    Object.assign(camera, { left: -seen * aspect, right: seen * aspect, top: seen, bottom: -seen });
  }

  function rotate(dir: 1 | -1) {
    const from = turn ? turn.to : yaw;
    turn = { from: yaw, to: from + (dir * Math.PI) / 2, at: performance.now() };
    if (ctx.reduceMotion.matches) {
      yaw = turn.to;
      turn = null;
    }
  }

  function flyTo(x: number, z: number) {
    if (move && !move.up) {
      pending = { want: true, fly: [x, z] };
      return;
    }
    toggle(true);
    touch();
    const to = new THREE.Vector3(x, 0, z);
    // Closer if it's further out than a flight's zoom; never further out than it is.
    const z1 = Math.max(zoom, ZOOM.fly);
    if (ctx.reduceMotion.matches) {
      target.copy(to);
      zoom = z1;
      return;
    }
    fly = { from: target.clone(), to, z0: zoom, z1, at: performance.now() };
  }

  /** Keeps the middle of the view over the deck. */
  function clamp() {
    target.x = THREE.MathUtils.clamp(target.x, FLOOR.minX, FLOOR.maxX);
    target.z = THREE.MathUtils.clamp(target.z, FLOOR.minZ - 6, FLOOR.maxZ);
  }

  /** A pan of (dx, dz) on screen (right, down) turned into the world by the camera's yaw. */
  function pan(dx: number, dz: number) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    target.x += dx * c + dz * s;
    target.z += -dx * s + dz * c;
    clamp();
  }

  // Keys, ahead of the office's own while up here: the turn, the pan, and the ways back down.
  ctx.keys.add('guard', (e) => {
    if (!on) return false;
    // Held while the view moves.
    if (move) return true;
    touch();
    // Anything you do up here takes over from a slow orbit.
    if (e.code !== 'KeyG' && e.code !== 'Escape') orbitSpeed = 0;
    if (e.code === 'KeyG' || e.code === 'Escape') {
      toggle(false);
      return true;
    }
    if (e.code === 'KeyQ' || e.code === 'KeyE') {
      if (!e.repeat) rotate(e.code === 'KeyQ' ? 1 : -1);
      return true;
    }
    if (PAN_KEYS[e.code]) {
      held.add(e.code);
      e.preventDefault();
      return true;
    }
    return false;
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => held.clear());
  ctx.keys.bind({ code: 'KeyG', repeat: false, run: () => toggle(true) });

  // A drag pans, the wheel zooms.
  let drag: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (!on || move) return;
    touch();
    drag = { x: e.clientX, y: e.clientY };
    orbitSpeed = 0;
  });
  window.addEventListener('pointerup', () => (drag = null));
  window.addEventListener('pointermove', (e) => {
    if (!on || !drag || move) return;
    touch();
    const perPx = (2 * HALF_HEIGHT) / zoom / window.innerHeight;
    pan(-(e.clientX - drag.x) * perPx, -((e.clientY - drag.y) * perPx) / Math.sin(PITCH));
    drag = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (!on || move) return;
      touch();
      orbitSpeed = 0;
      zoom = THREE.MathUtils.clamp(zoom * Math.exp(-e.deltaY * 0.0015), ZOOM.min, ZOOM.max);
    },
    { passive: true },
  );

  // On the way down your look is held where it was, and Walk's keys wait for the landing.
  ctx.ticks.add('pre', () => {
    if (!move || move.up) return;
    player.camYaw = move.look.yaw;
    player.lookPitch = move.look.pitch;
    player.clearKeys();
  });

  const at = new THREE.Vector3();
  ctx.ticks.add('me', ({ dt, now }) => {
    if (!on) return;
    // A window closing hands the controls back to Walk; up here they stay with the Overview.
    if (!move || move.up) player.enabled = false;
    if (turn) {
      const k = Math.min(1, (now - turn.at) / TURN_MS);
      yaw = turn.from + (turn.to - turn.from) * easeInOutCubic(k);
      if (k >= 1) turn = null;
    }
    const still = ctx.reduceMotion.matches;
    if (orbitSpeed && !turn && !fly && !move && !still) yaw += orbitSpeed * dt;
    if (fly) {
      const k = Math.min(1, (now - fly.at) / FLY_MS);
      target.lerpVectors(fly.from, fly.to, easeInOutCubic(k));
      zoom = fly.z0 + (fly.z1 - fly.z0) * easeInOutCubic(k);
      if (k >= 1) fly = null;
    }
    let mx = 0;
    let mz = 0;
    for (const code of held) {
      mx += PAN_KEYS[code][0];
      mz += PAN_KEYS[code][1];
    }
    if (mx || mz) pan((mx * PAN_SPEED * dt) / zoom, (mz * PAN_SPEED * dt) / zoom);
    // The drift, only while nothing else moves the view (the demo's orbit owns the turn).
    drift = !move && !turn && !fly && !orbitSpeed && !mx && !mz ? driftAt(now - inputAt, still) : STILL;
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const hh = HALF_HEIGHT / zoom;
    Object.assign(camera, { left: -hh * aspect, right: hh * aspect, top: hh, bottom: -hh });
    camera.updateProjectionMatrix();
    const y = yaw + drift.yaw;
    at.set(target.x + drift.x, target.y, target.z + drift.z);
    camera.position.set(at.x + Math.sin(y) * Math.cos(PITCH) * DIST, at.y + Math.sin(PITCH) * DIST, at.z + Math.cos(y) * Math.cos(PITCH) * DIST);
    camera.lookAt(at);
    camera.updateMatrixWorld();
    if (!move) return;
    const k = Math.min(1, (now - move.at) / TRANSITION_MS);
    const e = easeInOutCubic(k);
    placeMove(move.up ? e : 1 - e, aspect, at);
    if (k < 1) return;
    const up = move.up;
    move = null;
    // Landed: the frame just placed is the one the other camera draws, so the hand-over can't be seen.
    if (up) landUp();
    else landDown(false);
    const next = pending;
    pending = null;
    if (next?.fly) flyTo(next.fly[0], next.fly[1]);
    else if (next) toggle(next.want);
  });

  function orbit(speed: number) {
    orbitSpeed = speed;
    if (speed) toggle(true);
  }

  return {
    camera,
    active: () => on,
    moving: () => !!move,
    toggle,
    flyTo,
    orbit,
    zoomTier: () => zoomTierOf(zoom),
    onChange(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
}
