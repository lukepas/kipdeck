/**
 * The Overview: an orthographic camera over the whole deck at 48 degrees, a little off the axis on its
 * starboard side so the dais, the tiers, the pit and the arc facing it read as one plan; the demo shot and where
 * "fly to unit" lands. G goes up into it and back down to Walk (first person, the default). In it, Q
 * and E turn the deck a quarter at a time (280 ms), W A S D or the arrows or a drag pan, the wheel
 * zooms, and Esc or G walks again. A window opened over it closes back to it, with no extra click.
 */
import './camera-overview.css';
import * as THREE from 'three';
import { FLOOR } from '../../shared/layout';
import { h, modalOpen } from '../ui/dom';
import type { Ctx } from './context';
import type { Parts } from './parts';
import { OVERVIEW_PITCH, SIDE_YAW, framePose, framedPoints } from './overview-frame';

/** How the camera looks down, how far back it stands, and how much of the deck fills the screen's height at zoom 1. */
const PITCH = OVERVIEW_PITCH;
const DIST = 80;
const HALF_HEIGHT = 16;
const ZOOM = { min: 0.75, max: 3.2, fly: 2 } as const;
/** How long a quarter turn and a flight take (ms), and how fast the keys pan (m/s at zoom 1). */
const TURN_MS = 280;
const FLY_MS = 300;
const PAN_SPEED = 14;
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

const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

export interface Overview {
  readonly camera: THREE.OrthographicCamera;
  active(): boolean;
  /** Up into the Overview, or back down to Walk. */
  toggle(on?: boolean): void;
  /** Pans and zooms to (x, z) in 300 ms (a cut under reduced motion), going up into the Overview first. */
  flyTo(x: number, z: number): void;
  /** Turns slowly round the table at `speed` (radians a second) until you turn, pan or zoom yourself; 0 stops it. Demo mode's shot (features/demo). */
  orbit(speed: number): void;
}

export function installOverview(ctx: Ctx, parts: Pick<Parts, 'stage'>): Overview {
  const { player, canvas } = ctx;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
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
    target.set(pose.x, 0, pose.z);
    zoom = THREE.MathUtils.clamp(pose.zoom, ZOOM.min, ZOOM.max);
  }
  let turn: { from: number; to: number; at: number } | null = null;
  let fly: { from: THREE.Vector3; to: THREE.Vector3; z0: number; z1: number; at: number } | null = null;
  const held = new Set<string>();
  let walkFog: THREE.Fog | THREE.FogExp2 | null = null;
  /** The slow turn round the table (radians a second), or 0. */
  let orbitSpeed = 0;

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

  function toggle(want = !on) {
    if (want === on) return;
    on = want;
    const scene = parts.stage.scene;
    if (on) {
      frame();
      parts.stage.view = camera;
      player.unlock();
      player.clearKeys();
      player.enabled = false;
      // The fog is measured from the camera, which stands far back up here.
      walkFog = scene.fog;
      if (walkFog instanceof THREE.Fog) scene.fog = new THREE.Fog(walkFog.color, DIST + 12, DIST + 70);
    } else {
      parts.stage.view = null;
      held.clear();
      scene.fog = walkFog;
      player.enabled = !modalOpen();
      // A key press is a gesture: the browser lets the page take the mouse back for first person.
      if (player.enabled && player.view === 'first' && player.canLock) player.lock();
    }
    document.body.classList.toggle('overview', on);
    legend.classList.toggle('hidden', !on);
    ctx.hint.invalidate();
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
    toggle(true);
    const to = new THREE.Vector3(x, 0, z);
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
    if (!on) return;
    drag = { x: e.clientX, y: e.clientY };
    orbitSpeed = 0;
  });
  window.addEventListener('pointerup', () => (drag = null));
  window.addEventListener('pointermove', (e) => {
    if (!on || !drag) return;
    const perPx = (2 * HALF_HEIGHT) / zoom / window.innerHeight;
    pan(-(e.clientX - drag.x) * perPx, -((e.clientY - drag.y) * perPx) / Math.sin(PITCH));
    drag = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (!on) return;
      orbitSpeed = 0;
      zoom = THREE.MathUtils.clamp(zoom * Math.exp(-e.deltaY * 0.0015), ZOOM.min, ZOOM.max);
    },
    { passive: true },
  );

  ctx.ticks.add('me', ({ dt, now }) => {
    if (!on) return;
    // A window closing hands the controls back to Walk; up here they stay with the Overview.
    player.enabled = false;
    if (turn) {
      const k = Math.min(1, (now - turn.at) / TURN_MS);
      yaw = turn.from + (turn.to - turn.from) * ease(k);
      if (k >= 1) turn = null;
    }
    if (orbitSpeed && !turn && !fly && !ctx.reduceMotion.matches) yaw += orbitSpeed * dt;
    if (fly) {
      const k = Math.min(1, (now - fly.at) / FLY_MS);
      target.lerpVectors(fly.from, fly.to, ease(k));
      zoom = fly.z0 + (fly.z1 - fly.z0) * ease(k);
      if (k >= 1) fly = null;
    }
    let mx = 0;
    let mz = 0;
    for (const code of held) {
      mx += PAN_KEYS[code][0];
      mz += PAN_KEYS[code][1];
    }
    if (mx || mz) pan((mx * PAN_SPEED * dt) / zoom, (mz * PAN_SPEED * dt) / zoom);
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const hh = HALF_HEIGHT / zoom;
    Object.assign(camera, { left: -hh * aspect, right: hh * aspect, top: hh, bottom: -hh });
    camera.updateProjectionMatrix();
    camera.position.set(target.x + Math.sin(yaw) * Math.cos(PITCH) * DIST, target.y + Math.sin(PITCH) * DIST, target.z + Math.cos(yaw) * Math.cos(PITCH) * DIST);
    camera.lookAt(target);
  });

  function orbit(speed: number) {
    orbitSpeed = speed;
    if (speed) toggle(true);
  }

  return { camera, active: () => on, toggle, flyTo, orbit };
}
