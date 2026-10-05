/**
 * The vista: space close by the ship, laid over the sky features/space bakes, so a look out of a port
 * has depth and a body in it.
 *
 * - Layers of dust and gas streaming past the side ports at different depths, the nearer ones faster
 *   (./dust.ts): parallax as the ship makes way and as you walk past a port. One draw for them all.
 * - A big body off one side: a ringed gas giant filling about a third of a side port, its terminator
 *   where the room's key light comes from, the ring's shadow on its face, its atmosphere's rim
 *   (./giant.ts). Two draws. Each region of space has its own (space/sky.ts region()), and a passing
 *   planet keeps to the other side (features/space).
 * - The sun's flare, where the key light comes from, broken up by the canopy's ribs as they cross it
 *   (./flare.ts, logic.ts canopyClear). One draw.
 *
 * Settings > Bridge > Quality says how much: four layers of dust at High, three at Medium, one at Low;
 * the flare at Medium and High; the giant at every tier. When a unit needs the captain or is stuck the
 * dust, the flare and the giant's rim fall to SPACE_GIVE_WAY over half a second, as the nebula's knots
 * do (space/logic.ts); the giant itself stays. Each of the flare's shapes fades out where it would land
 * on a wall board's face. Ship motion Off and reduced motion hold the dust and the giant's turn still,
 * and nothing runs in a hidden tab (it moves on frames). The walk camera sees it all and the Overview's
 * doesn't (the bridge layer), and nothing in it can be clicked.
 */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { BRIDGE_LAYER, onBridgeLayer } from '../bridge/shapes';
import { debugHandle } from '../giveway';
import { KEY_AT } from '../lights/modes';
import { SPACE_GIVE_WAY } from '../space/logic';
import { region } from '../space/sky';
import { Dust } from './dust';
import { Flare } from './flare';
import { Giant } from './giant';
import { DUST_LAYERS, FLARE, canopyClear, dustLevel, easeTo, flareAt, layersShown, onScreen, overlaps, scroll } from './logic';

/** How fast the vista gives way and comes back, a share a millisecond: there in half a second. */
const YIELD_PER_MS = 1 / 500;
/** How fast a flare shape fades where a board's face is (a share a millisecond): out in 150 ms. */
const FADE_PER_MS = 1 / 150;
/** How fast the canopy's ribs cover and uncover the sun (a share a millisecond): smooth, not a flicker. */
const CLEAR_PER_MS = 1 / 120;
/** How fast the giant's face turns (of a turn, a second at cruise). */
const GIANT_SPIN = 1 / 2400;
/** How bright the flare is by Night and by Day. */
const FLARE_LEVEL = { night: 1, day: 0.45 } as const;

export interface Vista {
  /** What it holds in textures (bytes), for the budget. */
  bytes(): number;
  /** What it shows now, for the shots and the perf probe. */
  state(): { layers: number; flare: number; clear: number; giant: number; yieldK: number };
}

export function installVista(ctx: Ctx, parts: Pick<Parts, 'stage' | 'space' | 'quality' | 'giveWay' | 'lights' | 'boardFaces'>): Vista {
  const { renderer, scene } = ctx;
  const giant = new Giant(renderer);
  const dust = new Dust(renderer);
  const flare = new Flare();
  const group = new THREE.Group();
  group.name = 'vista';
  group.add(giant.group, dust.mesh, flare.mesh);
  onBridgeLayer(group);
  scene.add(group);

  const sun = new THREE.Vector3(...KEY_AT).normalize();
  let shown = layersShown(parts.quality.look().parallax);
  let flareOn = parts.quality.look().flare;
  parts.quality.on((_, look) => {
    shown = layersShown(look.parallax);
    flareOn = look.flare;
  });

  let held = -1;
  let yieldK = 1;
  let day = 0;
  let spin = 0;
  let clear = 0;
  let flareLevel = 0;
  const ndc = new THREE.Vector3();
  const eye = new THREE.Vector3();

  ctx.ticks.add('world', ({ dt }) => {
    const ms = dt * 1000;
    const view = parts.space.sky();
    if (view.region !== held) {
      held = view.region;
      giant.place(region(held).giant);
    }
    yieldK = easeTo(yieldK, parts.giveWay.attention() ? SPACE_GIVE_WAY : 1, ms, YIELD_PER_MS);
    day = easeTo(day, parts.lights.mode() === 'day' ? 1 : 0, ms, YIELD_PER_MS);
    const speed = parts.space.speed();
    for (let i = 0; i < DUST_LAYERS.length; i++) {
      const at = scroll(dust.travel.getComponent(i), DUST_LAYERS[i], speed, dt);
      dust.travel.setComponent(i, at);
    }
    // A surge or the jump streaks the stars: the dust thins out of the way of it.
    const streak = Math.min(1, Math.max(0, (speed - 2) / 6));
    dust.set(shown, dustLevel(streak, parts.space.tunnelOpen()) * yieldK, day);
    spin += dt * GIANT_SPIN * speed;
    giant.set(sun, (1 + 0.15 * day) * (1 - parts.space.tunnelOpen()), yieldK, spin, view.angle);
  });

  // The flare after the boards' faces are on screen (they are worked out in 'aim').
  ctx.ticks.add('hud', ({ dt }) => {
    const ms = dt * 1000;
    // The camera drawing the frame: the walk camera's, never the Overview's (which doesn't see the bridge layer).
    const cam = parts.stage.view ?? ctx.camera;
    let want = 0;
    let sx = 0;
    let sy = 0;
    if (flareOn && (cam as THREE.PerspectiveCamera).isPerspectiveCamera && cam.layers.isEnabled(BRIDGE_LAYER)) {
      cam.getWorldPosition(eye);
      ndc.copy(eye).addScaledVector(sun, 100).project(cam);
      // In front of the camera: projected depth under 1.
      if (ndc.z < 1) {
        sx = ndc.x;
        sy = ndc.y;
        clear = easeTo(clear, canopyClear(eye, sun), ms, CLEAR_PER_MS);
        want = onScreen(sx, sy);
      }
    }
    want *= yieldK * (day > 0.5 ? FLARE_LEVEL.day : FLARE_LEVEL.night) * (1 - parts.space.tunnelOpen());
    flareLevel = easeTo(flareLevel, want, ms, YIELD_PER_MS * 4);
    // Each shape out where it would land on a board's face.
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const faces = parts.boardFaces.faces();
    FLARE.forEach((e, i) => {
      const p = flareAt(sx, sy, e.at);
      const hy = e.size * (e.cell === 0 ? 0.45 : 1);
      const hx = (hy / aspect) * (e.cell === 1 ? 9 : 1);
      const hit = faces.some((f) => f.rect && overlaps(p.x, p.y, hx, hy, f.rect));
      flare.fade[i] = easeTo(flare.fade[i], hit ? 0 : 1, ms, FADE_PER_MS);
    });
    flare.set(sx, sy, aspect, flareLevel, clear);
  });

  const vista: Vista = {
    bytes: () => giant.bytes() + dust.bytes(),
    state: () => ({ layers: shown, flare: flareLevel, clear, giant: held, yieldK }),
  };
  debugHandle('vista', vista);
  return vista;
}
