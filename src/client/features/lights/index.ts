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
import type * as THREE from 'three';
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
}

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

  function apply(next: LightMode, nextStep: number) {
    const rig = LIGHT_MODES[next];
    const k = brightnessFactor(nextStep);
    const { hemi, key, fill, rims } = stage.lights;
    ctx.renderer.toneMappingExposure = rig.exposure;
    hemi.color.set(rig.hemi.sky);
    hemi.groundColor.set(rig.hemi.ground);
    hemi.intensity = rig.hemi.i * k;
    const tune = (light: THREE.Light, l: { color: string; i: number }) => {
      light.color.set(l.color);
      light.intensity = l.i * k;
    };
    tune(key, rig.key);
    tune(fill, rig.fill);
    for (const rim of rims) tune(rim, rig.rim);
    for (const spot of lamps.pods) tune(spot, rig.pods);
    tune(lamps.table, rig.table);
    tune(lamps.holo, rig.holo);
    if (next !== mode) {
      repaint(ctx.scene, next);
      repaintGrids(next);
      markLight(next);
    }
    mode = next;
    step = nextStep;
    glow();
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

  return { mode: () => mode ?? 'night' };
}
