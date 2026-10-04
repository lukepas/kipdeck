/**
 * What the office is drawn on and with: the renderer on its canvas, the scene and its lights, the
 * camera and the office building.
 */
import * as THREE from 'three';
import { buildOffice } from '../world/office';
import type { Office } from '../world/types';
import type { Ctx } from './context';
import { DECK } from '../world/office/materials';

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
  readonly office: Office;
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

/** The slate void round the deck, and how far off the fog starts and ends, so the slab fades at its edges. */
export const VOID = { color: DECK.void, fogNear: 30, fogFar: 70 } as const;

/**
 * Sets up the renderer on `canvas`, and builds the scene: the deck floating in a slate void, a cool
 * sky-and-ground fill, one key light from high in the north-west that throws the only shadows, and
 * the office (world/office).
 */
export function createScene(canvas: HTMLCanvasElement, renderer: THREE.WebGLRenderer): Stage {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.4;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(VOID.color);
  scene.fog = new THREE.Fog(VOID.color, VOID.fogNear, VOID.fogFar);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, FAR);

  scene.add(new THREE.HemisphereLight('#AEB8C4', '#3A4756', 2.4));
  // The key: cool, from high over the north-west corner, the one light that casts shadows. Its
  // shadow map covers the slab and the back office, no more.
  const key = new THREE.DirectionalLight('#DCE3EA', 2.6);
  key.position.set(-14, 22, -10);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -26, right: 26, top: 24, bottom: -24, near: 1, far: 70 });
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.03;
  key.shadow.radius = 3;
  scene.add(key);
  // A faint counter from the south-east, so the faces the key can't reach aren't lost in the slate.
  const fill = new THREE.DirectionalLight('#8FA3B9', 0.7);
  fill.position.set(12, 9, 16);
  scene.add(fill);

  const office = buildOffice();
  scene.add(office.group);
  return { canvas, renderer, scene, camera, view: null, office };
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
