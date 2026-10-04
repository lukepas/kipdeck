/**
 * What the office is drawn on and with: the renderer on its canvas, the scene and its lights, the
 * camera and the office building.
 */
import * as THREE from 'three';
import { buildOffice } from '../world/office';
import type { Office } from '../world/types';
import type { Ctx } from './context';
import { DECK } from '../world/office/materials';
import { FILL_AT, KEY_AT, LIGHT_MODES, RIMS_AT } from '../features/lights/modes';

/** How far the camera sees: the whole floor and the back office, corner to corner. */
export const FAR = 120;
/** How wide the camera sees (degrees), unless what you're doing has it otherwise (see ctx.view). */
export const FOV = 55;

/** The renderer, the scene with its lights and camera, and what's always in it (see createScene). */
export interface Stage {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  /** The camera the frame is drawn with instead of `camera`, while one is set (the Overview, see core/camera-overview.ts). */
  view: THREE.Camera | null;
  /** Draws the frame through something other than the plain renderer while set (the bloom, see features/lights). */
  draw: ((camera: THREE.Camera) => void) | null;
  readonly office: Office;
  /** The scene's own lights, which the bridge lights' mode retunes (features/lights). */
  readonly lights: SceneLights;
}

/** The lights over the whole scene: the deck's own lamps are the office's (features/lights/rig.ts). */
export interface SceneLights {
  hemi: THREE.HemisphereLight;
  key: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
  rims: THREE.DirectionalLight[];
}

export function makeRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer | null {
  try {
    return new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (err) {
    console.error(err);
    return null;
  }
}

/** No WebGL here (switched off, or no graphics for it): on to the 2D view, which does without. */
export function noWebGL(): Promise<never> {
  location.replace('/lite?why=webgl');
  return new Promise(() => {});
}

/**
 * The most pixels drawn per CSS pixel: 1.5, not a Retina screen's 2, which would shade almost twice as
 * many fragments through the lights, the glow and FXAA for little the eye can see past FXAA.
 */
export const MAX_PIXEL_RATIO = 1.5;

/** The slate void round the deck, and how far off the fog starts and ends, so the slab fades at its edges. */
export const VOID = { color: DECK.void, fogNear: 30, fogFar: 70 } as const;

/**
 * Sets up the renderer on `canvas`, and builds the scene: the deck in space, a cool sky-and-ground
 * fill, a key light through the forward viewport from high over the bow that throws the only shadows,
 * a fill from aft, two low rims from east and west, and the office (world/office). The lights start at
 * Night's levels (features/lights/modes.ts); the lights' mode retunes them, and never adds or takes one
 * away (that would recompile every material).
 */
export function createScene(canvas: HTMLCanvasElement, renderer: THREE.WebGLRenderer): Stage {
  const night = LIGHT_MODES.night;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = night.exposure;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(VOID.color);
  scene.fog = new THREE.Fog(VOID.color, VOID.fogNear, VOID.fogFar);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, FAR);

  const hemi = new THREE.HemisphereLight(night.hemi.sky, night.hemi.ground, night.hemi.i);
  scene.add(hemi);
  // The key: "core light" through the forward viewport, from high over the bow, the one light that
  // casts shadows. Its shadow map covers the slab and the back office, no more.
  const key = new THREE.DirectionalLight(night.key.color, night.key.i);
  key.position.set(...KEY_AT);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 80 });
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.03;
  key.shadow.radius = 3;
  scene.add(key);
  // A counter from aft, through the aft glass, so the faces the key can't reach aren't lost.
  const fill = new THREE.DirectionalLight(night.fill.color, night.fill.i);
  fill.position.set(...FILL_AT);
  scene.add(fill);
  // Two low rims from east and west, no shadows: they cut units and consoles out of the floor.
  const rims = RIMS_AT.map((at) => {
    const rim = new THREE.DirectionalLight(night.rim.color, night.rim.i);
    rim.position.set(at[0], at[1], at[2]);
    scene.add(rim);
    return rim;
  });

  const office = buildOffice();
  scene.add(office.group);
  return { canvas, renderer, scene, camera, view: null, draw: null, office, lights: { hemi, key, fill, rims } };
}

/** The canvas and the camera fit the window, and keep fitting it. */
export function fitWindow(ctx: Ctx) {
  function resize() {
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    ctx.renderer.setSize(w, hgt, false);
    ctx.camera.aspect = w / hgt;
    ctx.camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();
}
