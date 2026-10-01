/**
 * What the office is drawn on and with: the renderer on its canvas, the scene and its lights, the
 * camera and the office building.
 */
import * as THREE from 'three';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { buildOffice } from '../world/office';
import type { Office } from '../world/types';
import type { Ctx } from './context';
import { noOutline } from './outline';

/** How far the camera sees: the whole floor and the back office, corner to corner. */
export const FAR = 120;
/** How wide the camera sees (degrees), unless what you're doing has it otherwise (see ctx.view). */
export const FOV = 55;

/** The renderer, the scene with its lights and camera, and what's always in it (see createScene). */
export interface Stage {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  /** Draws the scene with the toon outline (see drawScene in core/loop.ts). */
  readonly effect: OutlineEffect;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
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

/**
 * Sets up the renderer on `canvas`, and builds the scene: the office, the camera, and a fixed rig of
 * lights that keeps every corner evenly lit, all day.
 */
export function createScene(canvas: HTMLCanvasElement, renderer: THREE.WebGLRenderer): Stage {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const effect = new OutlineEffect(renderer, { defaultThickness: 0.0032, defaultColor: [0.17, 0.18, 0.26] });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#bfe3ff');
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, FAR);

  scene.add(new THREE.HemisphereLight('#fff5e6', '#c9a27a', 1.5), new THREE.AmbientLight('#ffffff', 0.5));
  // Light from high over the room, for the shadows under the desks and the people.
  const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
  sun.position.set(-8, 18, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  // Wide enough for the office and its back office.
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 60 });
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  const office = buildOffice();
  scene.add(office.group);
  noOutline(office.group);
  return { canvas, renderer, effect, scene, camera, office };
}

/** The canvas and the camera (and your hands' own camera) fit the window, and keep fitting it. */
export function fitWindow(ctx: Ctx) {
  function resize() {
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    ctx.renderer.setSize(w, hgt, false);
    ctx.camera.aspect = w / hgt;
    ctx.camera.updateProjectionMatrix();
    ctx.hands.setAspect(w / hgt);
  }
  window.addEventListener('resize', resize);
  resize();
}
