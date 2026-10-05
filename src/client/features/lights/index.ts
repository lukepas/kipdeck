/**
 * The bridge's lights: Night (low light, comfortable in a dark room yet clearly readable) or Day (high
 * light, a bright ship interior), or Auto, which follows the system's dark or light setting; and a
 * Brightness step either way (Settings > Bridge). The mode retunes the scene's lights and the deck's
 * lamps (LIGHT_MODES in ./modes.ts; Brightness scales them all), the renderer's exposure, the glow, the deck's neutrals (Day
 * repaints them, ./palette.ts) and the page's own colors (the HUD's dark or print set, lighting.ts).
 *
 * The hues of state never change with the mode, and nothing tints the room: every attention mark sits
 * on instrument black of its own (the ring inlay, the callout chip), so it reads the same by day.
 */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { lightModeOf, markLight, onSystemLight, systemLight, type LightMode } from '../../lighting';
import { demoOn } from '../demo';
import type { Bloom, BloomLook } from './bloom';
import { LIGHT_MODES, brightnessFactor } from './modes';
import { repaint, repaintGrids } from './palette';

/** Demo mode's glow: a little more, so a compressed video still reads (features/demo). */
const DEMO_BLOOM: BloomLook = { strength: 0.4, radius: 0.5, threshold: 0.82 };
/** How often Day looks again for what's been added to the deck since (s): a unit hired, a deck arrived. */
const REPAINT_EVERY = 2;

export interface Lights {
  /** The mode the bridge is lit in now. */
  mode(): LightMode;
  /**
   * Shifts the room's light for a jump (features/space): toward cool at -1, toward a warm white at +1,
   * as the mode has it at 0. Only the fill from above and the key: the state marks give their own light.
   */
  tint(k: number): void;
  /**
   * Steps the room's light down for an alert condition (features/alert): each light's intensity times
   * what `k` says for it (by its name, how far aft it stands, z, and which pod it hangs over, or -1),
   * or as the mode has it with null. Only intensities: never a colour, never the exposure.
   */
  dim(k: ((name: LampName, z: number, pod: number) => number) | null): void;
  /**
   * The room's light for a jump (features/space), times the mode's and the dimmer's: let down through
   * the countdown, lit from the glass by the tunnel, 1 as the mode has it.
   */
  level(k: number): void;
}

/** The rig's lights by name, as the dimmer addresses them. */
export type LampName = 'hemi' | 'key' | 'fill' | 'rim' | 'pods' | 'table' | 'holo';

/** What a jump shifts the room's light toward: cool going in, a warm white coming out (near grey, so no state's hue). */
const JUMP_TINT = { cool: new THREE.Color('#A9D4FF'), warm: new THREE.Color('#FFF1E2'), by: 0.45 } as const;

export function installLights(ctx: Ctx, parts: Pick<Parts, 'stage' | 'settings'>): Lights {
  const { stage } = parts;
  const { lamps } = ctx.office;
  const demo = demoOn();
  let light = systemLight();
  onSystemLight(() => void (light = systemLight()));

  let mode: LightMode | null = null;
  let step = 0;
  let bloom: Bloom | null = null;
  let bloomLoading = false;

  const bloomLook = (): BloomLook | null => (demo ? DEMO_BLOOM : LIGHT_MODES[mode ?? 'night'].bloom);

  /** The glow as the mode has it: loaded the first time it's wanted, put away while it isn't. */
  function glow() {
    const look = bloomLook();
    if (bloom) {
      if (look) bloom.set(look);
      bloom.on(!!look);
      return;
    }
    if (!look || bloomLoading) return;
    bloomLoading = true;
    void import('./bloom').then((m) => {
      bloom = m.makeBloom(stage, ctx.camera, look);
      glow();
    });
  }

  let dimBy: ((name: LampName, z: number, pod: number) => number) | null = null;
  let jumpLevel = 1;
  /** Every light's intensity: the mode's, times Brightness, times the alert's dimmer. */
  function levels() {
    const rig = LIGHT_MODES[mode ?? 'night'];
    const k = brightnessFactor(step) * jumpLevel;
    const f = (name: LampName, z: number, pod = -1) => (dimBy ? dimBy(name, z, pod) : 1);
    const { hemi, key, fill, rims } = stage.lights;
    hemi.intensity = rig.hemi.i * k * f('hemi', 0);
    key.intensity = rig.key.i * k * f('key', key.position.z);
    fill.intensity = rig.fill.i * k * f('fill', fill.position.z);
    for (const rim of rims) rim.intensity = rig.rim.i * k * f('rim', rim.position.z);
    lamps.pods.forEach((spot, i) => (spot.intensity = rig.pods.i * k * f('pods', spot.position.z, i)));
    lamps.table.intensity = rig.table.i * k * f('table', lamps.table.position.z);
    lamps.holo.intensity = rig.holo.i * k * f('holo', lamps.holo.position.z);
  }

  function apply(next: LightMode, nextStep: number) {
    const rig = LIGHT_MODES[next];
    const { hemi, key, fill, rims } = stage.lights;
    ctx.renderer.toneMappingExposure = rig.exposure;
    hemi.color.set(rig.hemi.sky);
    hemi.groundColor.set(rig.hemi.ground);
    const tune = (light: THREE.Light, l: { color: string }) => light.color.set(l.color);
    tune(key, rig.key);
    tune(fill, rig.fill);
    for (const rim of rims) tune(rim, rig.rim);
    for (const spot of lamps.pods) tune(spot, rig.pods);
    tune(lamps.table, rig.table);
    tune(lamps.holo, rig.holo);
    base.sky.copy(hemi.color);
    base.key.copy(key.color);
    tintNow = 0;
    if (next !== mode) {
      repaint(ctx.scene, next);
      repaintGrids(next);
      markLight(next);
    }
    mode = next;
    step = nextStep;
    levels();
    glow();
  }

  const base = { sky: new THREE.Color(), key: new THREE.Color() };
  let tintNow = 0;
  function tint(k: number) {
    if (k === tintNow) return;
    tintNow = k;
    const { hemi, key } = stage.lights;
    const to = k < 0 ? JUMP_TINT.cool : JUMP_TINT.warm;
    const by = Math.min(1, Math.abs(k)) * JUMP_TINT.by;
    hemi.color.copy(base.sky).lerp(to, by);
    key.color.copy(base.key).lerp(to, by);
  }

  let repaintAt = 0;
  ctx.ticks.add('pre', ({ now }) => {
    const s = parts.settings;
    const want = lightModeOf(s.lighting, light);
    if (want !== mode || s.brightness !== step) apply(want, s.brightness);
    // Day: whatever's come onto the deck since takes Day's colors too.
    if (mode === 'day' && now - repaintAt > REPAINT_EVERY * 1000) {
      repaintAt = now;
      repaint(ctx.scene, 'day');
    }
  });
  apply(lightModeOf(parts.settings.lighting, light), parts.settings.brightness);

  const dim = (k: typeof dimBy) => {
    dimBy = k;
    levels();
  };
  const level = (k: number) => {
    if (Math.abs(k - jumpLevel) < 1e-3) return;
    jumpLevel = k;
    levels();
  };
  return { mode: () => mode ?? 'night', tint, dim, level };
}
