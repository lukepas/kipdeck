/**
 * Image-based light: what the deck's surfaces reflect. Two probes (./probe.ts), each a 128 cube
 * captured a face a frame and prefiltered once:
 *
 * - The room: only what gives light inside (the practicals, the boards, the strips, the holo) seen
 *   from over the table, as the environment of everything inside (scene.environment), so the console
 *   tops, the steel and the conn catch the screens and the cove, and the floor's walkways reflect them
 *   box-projected (world/office/floor.ts). The viewport glass reflects it too, not the sky. It is
 *   captured once the floor has arrived and again on a change of the lights' mode, Brightness or the
 *   alert condition, never every frame, so it never moves with the sky.
 * - The sky: the sky's own sphere, as the environment of the outside of the ship (the hull plating
 *   and the nacelles, the materials hullPanels makes, marked userData.outside). Captured at the start
 *   and after each jump to new space.
 *
 * At Low both are dark (their intensities at nothing, which the shader branches past, so nothing
 * recompiles and no pixel pays for a lookup), and so is the trim atlas.
 *
 * How strong each is comes from the lights' mode (LIGHT_MODES env: Night 0.35, Day 0.6), times
 * Brightness. Both textures exist from the first frame, so every material is compiled with them once,
 * behind the loading screen, and a new capture only redraws them.
 */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { ROOM_PROBE, FLOOR_UNIFORMS } from '../../world/office/floor';
import { TRIM_UNIFORMS } from '../../world/office/trim';
import { VIEWPORT_GLASS } from '../../world/office/materials';
import { LIGHT_MODES, brightnessFactor } from '../lights/modes';
import { SPACE_COLORS } from '../space/logic';
import { Probe } from './probe';

/** The layers the probes see: the room's lights, and the sky's sphere. */
export const ROOM_LIGHT_LAYER = 5;
export const SKY_LAYER = 6;
/** How strong the sky's light is on the hull, against the room's on the inside. */
const SKY_ENV = 0.8;
/** How strongly the viewport glass reflects the room. */
const GLASS_ENV = 0.55;
/** What lies outside the ship, and the air's own light (features/atmos), never part of the room's light. */
const OUTSIDE = new Set(['space-sky', 'space-stars', 'fleet', 'destination', 'sorties', 'drive-core', 'atmos']);
/**
 * How much of the room's light reaches a surface's diffuse colour, against its reflections: the probe
 * holds only what glows (the holo's core is the brightest thing on the deck), and a lamp's worth of
 * it in every shadow would wash the room cyan. The reflections are what the probe is for; the lamps
 * (features/lights) light the room.
 */
export const ROOM_DIFFUSE = 0.2;
/** Frames after a floor arrives before the room is captured: once the merge (features/merge) has its meshes in. */
const ROOM_AFTER = 8;

/** Whether `o` gives light the room should reflect: a practical, a board, a strip, the holo, a lit part. */
function givesLight(o: THREE.Object3D): boolean {
  const m = (o as THREE.Mesh).material;
  if (!(o as THREE.Mesh).isMesh || !m || Array.isArray(m)) return false;
  if (m instanceof THREE.MeshBasicMaterial || m instanceof THREE.ShaderMaterial) return true;
  return m instanceof THREE.MeshStandardMaterial && m.emissiveIntensity > 0 && m.emissive.getHex() !== 0;
}

/** The irradiance chunk with the room's diffuse share (ROOM_DIFFUSE) applied, before anything compiles with it. */
function dimIrradiance() {
  let chunk = THREE.ShaderChunk.envmap_physical_pars_fragment;
  const at = 'return PI * envMapColor.rgb * envMapIntensity;';
  if (chunk.includes(at)) chunk = chunk.replace(at, `return PI * envMapColor.rgb * envMapIntensity * ${ROOM_DIFFUSE.toFixed(2)};`);
  // With the light at nothing (the sky's at Low), no lookups at all: the intensity is a uniform, the
  // same for every pixel, so the branch costs nothing where it's on.
  for (const fn of ['vec3 getIBLIrradiance( const in vec3 normal ) {', 'vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {']) {
    chunk = chunk.replace(fn, `${fn}\n\t\tif ( envMapIntensity <= 0.0 ) return vec3( 0.0 );`);
  }
  THREE.ShaderChunk.envmap_physical_pars_fragment = chunk;
}

export function installIbl(ctx: Ctx, parts: Pick<Parts, 'stage' | 'settings' | 'lights' | 'quality' | 'alert' | 'space'>) {
  const { renderer, scene } = ctx;
  dimIrradiance();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new Probe(renderer, pmrem, new THREE.Vector3(ROOM_PROBE.x, ROOM_PROBE.y, ROOM_PROBE.z), ROOM_LIGHT_LAYER, 128, new THREE.Color(0, 0, 0));
  const sky = new Probe(renderer, pmrem, new THREE.Vector3(0, 0, 0), SKY_LAYER, 128, new THREE.Color(SPACE_COLORS.void).convertSRGBToLinear());
  scene.environment = room.texture;
  VIEWPORT_GLASS.envMapIntensity = GLASS_ENV;

  // The outside of the ship takes the sky's light instead.
  const outside: THREE.MeshStandardMaterial[] = [];
  scene.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (m instanceof THREE.MeshStandardMaterial && m.userData.outside && !outside.includes(m)) {
      m.envMap = sky.texture;
      outside.push(m);
    }
  });
  scene.getObjectByName('space-sky')?.layers.enable(SKY_LAYER);

  /** Puts everything that gives light inside on the room's layer (what's been added or merged since included). */
  function tagRoom() {
    const walk = (o: THREE.Object3D) => {
      if (OUTSIDE.has(o.name)) return;
      if (givesLight(o)) o.layers.enable(ROOM_LIGHT_LAYER);
      for (const c of o.children) walk(c);
    };
    walk(scene);
  }

  let skyOn = parts.quality.look().skyLight;
  let roomOn = parts.quality.look().roomLight;
  parts.quality.on((_, look) => {
    skyOn = look.skyLight;
    roomOn = look.roomLight;
    FLOOR_UNIFORMS.uGloss.value = look.glossFloor ? 1 : 0;
    TRIM_UNIFORMS.uTrimOn.value = look.roomLight ? 1 : 0;
  });

  let roomIn = -1;
  store.on('floor', () => void (roomIn = ROOM_AFTER));
  sky.capture();
  let seen = { mode: '', step: NaN, condition: '' };
  let phase = parts.space.phase();
  ctx.ticks.add('pre', () => {
    // How strong each is: the mode's, times Brightness.
    const mode = parts.lights.mode();
    const k = LIGHT_MODES[mode].env * brightnessFactor(parts.settings.brightness);
    scene.environmentIntensity = roomOn ? k : 0;
    for (const m of outside) m.envMapIntensity = skyOn ? SKY_ENV * k : 0;
    // Captured again when what the room gives off changes: the mode, Brightness, the condition.
    const now = { mode, step: parts.settings.brightness, condition: parts.alert.condition() };
    if (now.mode !== seen.mode || now.step !== seen.step || now.condition !== seen.condition) {
      if (seen.mode) roomIn = Math.max(roomIn, 1);
      seen = now;
    }
    if (roomIn > 0 && --roomIn === 0) {
      tagRoom();
      room.capture();
    }
    // And the sky after a jump to new space.
    const p = parts.space.phase();
    if (p === 'idle' && phase !== 'idle') sky.capture();
    phase = p;
    // A face a frame, the room first.
    if (room.busy()) room.step(scene);
    else sky.step(scene);
  });

  // For the shots and the perf probe: the probes, to look into.
  scene.userData.ibl = { room, sky, floor: FLOOR_UNIFORMS, trim: TRIM_UNIFORMS };
  return {
    /** The probes' memory (bytes), for the budget. */
    bytes: () => room.bytes() + sky.bytes(),
  };
}
