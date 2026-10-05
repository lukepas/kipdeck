/**
 * Settings > Bridge > Quality: Auto, Low, Medium or High, how much the 3D deck draws (the tiers are
 * ./tiers.ts). Auto starts from what the graphics are and, once the office has warmed up, steps down a
 * tier when frames keep falling behind (StepDown in framerate.ts); it never steps back up by itself,
 * and a tier picked by hand stays put. The 2D view offer for frames that are slower still (SlowFrames)
 * stays the floor under every tier.
 *
 * This part applies what's the renderer's own (the pixel ratio, and the key light's shadow map: its
 * size and how often it's drawn) and publishes the tier to the parts that draw more or less with it
 * (`on`): the glow (features/lights), the sky's light on the hull (features/ibl), the floor's gloss, the
 * star layers. Switching applies live, and the setting is kept with the rest in this browser.
 */
import type * as THREE from 'three';
import type { Ctx } from '../../core/context';
import type { Off } from '../../core/registry';
import type { Parts } from '../../core/parts';
import { MAX_PIXEL_RATIO } from '../../core/scene';
import { StepDown } from '../../framerate';
import { TIER_LOOKS, autoTier, least, lower, tierOf, type Tier, type TierLook } from './tiers';

export type { Tier, TierLook } from './tiers';

export interface Quality {
  /** The tier the deck draws at now. */
  tier(): Tier;
  /** What that tier draws. */
  look(): TierLook;
  /** Calls `fn` with the tier now and whenever it changes (a pick in Settings, or Auto stepping down). */
  on(fn: (tier: Tier, look: TierLook) => void): Off;
  /** The graphics the browser names, as Auto read them. */
  renderer(): string;
}

/** Where Auto's step downs are kept for next time, for the same graphics, so a slow machine doesn't start high again. */
const CAP_KEY = 'agent-office.quality-cap';

function savedCap(renderer: string): Tier | null {
  try {
    const c = JSON.parse(localStorage.getItem(CAP_KEY) ?? 'null');
    if (c?.renderer === renderer && (c.tier === 'medium' || c.tier === 'low')) return c.tier;
  } catch {
    // storage blocked
  }
  return null;
}

function saveCap(renderer: string, tier: Tier) {
  try {
    localStorage.setItem(CAP_KEY, JSON.stringify({ renderer, tier }));
  } catch {
    // storage blocked
  }
}

/** The graphics the browser names: the unmasked renderer where it says, its plain name otherwise. */
export function rendererName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  try {
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return typeof name === 'string' ? name : '';
  } catch {
    return '';
  }
}

/** How far a mover has to go (m, or radians of turn) before Low draws the shadows again. */
const MOVED = 0.01;

export function installQuality(ctx: Ctx, parts: Pick<Parts, 'stage' | 'settings' | 'views' | 'peers'>): Quality {
  const { renderer } = ctx;
  const name = rendererName(renderer.getContext());
  let auto: Tier = least(autoTier(name), savedCap(name) ?? 'high');
  let tier: Tier = tierOf(parts.settings.quality, auto);
  const fns = new Set<(tier: Tier, look: TierLook) => void>();
  const steps = new StepDown();
  const key = parts.stage.lights.key;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  function apply() {
    const look = TIER_LOOKS[tier];
    document.documentElement.dataset.quality = tier;
    const ratio = Math.min(window.devicePixelRatio, look.pixelRatio, MAX_PIXEL_RATIO);
    if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
    if (key.shadow.mapSize.x !== look.shadow.size) {
      key.shadow.mapSize.set(look.shadow.size, look.shadow.size);
      key.shadow.map?.dispose();
      key.shadow.map = null;
    }
    renderer.shadowMap.needsUpdate = true;
    for (const fn of fns) fn(tier, look);
  }

  // Low draws the shadows again only when someone moves: you, the others here, a unit or the droid.
  const sig = new Float64Array(4);
  const last = new Float64Array(4);
  function movers(): boolean {
    sig.fill(0);
    let i = 0;
    // Where each is in the world as last drawn, and which way it faces: a weighted sum, cheap to compare.
    const add = (o: THREE.Object3D) => {
      const m = o.matrixWorld.elements;
      i++;
      sig[0] += m[12] * (1 + (i % 7));
      sig[1] += m[13] * (1 + (i % 5));
      sig[2] += m[14] * (1 + (i % 3));
      sig[3] += (m[0] + m[8]) * (1 + (i % 11));
    };
    for (const v of parts.views.workerViews.values()) add(v.model.figure);
    for (const r of parts.peers.remotes.values()) add(r.person.root);
    add(ctx.me.root);
    add(ctx.office.droid.root);
    let moved = false;
    for (let k = 0; k < 4; k++) {
      if (Math.abs(sig[k] - last[k]) > MOVED) moved = true;
      last[k] = sig[k];
    }
    return moved;
  }

  let drawnAt = -Infinity;
  ctx.ticks.add('pre', ({ now, delta }) => {
    const want = tierOf(parts.settings.quality, auto);
    if (want !== tier) {
      tier = want;
      apply();
    }
    // Auto, falling behind: a tier less, kept for next time on these graphics.
    if (parts.settings.quality === 'auto' && steps.frame(now, delta * 1000) && auto !== 'low') {
      auto = lower(auto);
      saveCap(name, auto);
      console.info(`Quality: frames are falling behind on ${name || 'these graphics'}, drawing at ${auto}`);
    }
  });
  // The key light's shadow map: every frame, at a rate, or when something moves.
  ctx.ticks.add('hud', ({ now }) => {
    const every = TIER_LOOKS[tier].shadow.everyMs;
    const moved = every === null && movers();
    if (every === 0 || moved || (every !== null && now - drawnAt >= every)) renderer.shadowMap.needsUpdate = true;
    if (renderer.shadowMap.needsUpdate) drawnAt = now;
  });
  apply();

  return {
    tier: () => tier,
    look: () => TIER_LOOKS[tier],
    on(fn) {
      fns.add(fn);
      fn(tier, TIER_LOOKS[tier]);
      return () => void fns.delete(fn);
    },
    renderer: () => name,
  };
}
