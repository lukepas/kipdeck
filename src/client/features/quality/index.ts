/**
 * Settings > Bridge > Quality: Auto, Low, Medium or High, how much the 3D deck draws (the tiers are
 * ./tiers.ts). Auto starts from what the graphics are and judges the frames as they come (./governor.ts):
 * it steps down a tier when they keep falling behind, back up when they have room to spare, holds at
 * Medium on graphics that start at High unless frames are very slow, and throws away the frames after
 * anything that hitches once (./governor.ts says which). A step down is kept for a reload in the same
 * session, never longer than a day (./cap.ts). A tier picked by hand stays put. The 2D view offer for
 * frames that are slower still (SlowFrames) stays the floor under every tier.
 *
 * This part applies what's the renderer's own (the pixel ratio, and the key light's shadow map: its
 * size and how often it's drawn) and publishes the tier to the parts that draw more or less with it
 * (`on`): the glow (features/lights), the sky's light on the hull (features/ibl), the floor's gloss, the
 * star layers. Switching applies live, and the setting is kept with the rest in this browser. What it
 * says about itself (the tier now, Auto's last step and why) goes to ./status.ts, for the chip in
 * Settings and the Quality row in the HUD menu (./menu.ts).
 */
import type * as THREE from 'three';
import type { Ctx } from '../../core/context';
import type { Off } from '../../core/registry';
import type { Parts } from '../../core/parts';
import { MAX_PIXEL_RATIO } from '../../core/scene';
import { saveSettings } from '../../state';
import { DRAW_BUDGET, MOTION_BUDGET_MS, TIER_LOOKS, autoTier, tierOf, type Tier, type TierLook } from './tiers';
import { frameTiming, type FrameTiming } from './timing';
import { Governor, floorFor } from './governor';
import { clearCap, readCap, sessionId, writeCap, type Store } from './cap';
import { publishQualityStatus, type QualityStatus } from './status';

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
  /**
   * Tells Auto that the next `ms` of frames say nothing about this computer (a recompile, a rebuild, a
   * burst of work that happens once): they're thrown away rather than judged.
   */
  suspend(ms?: number): void;
  /** What Settings and the HUD menu say: the tier now, the top, Auto's last step. */
  status(): QualityStatus;
  /** Forgets Auto's step downs and draws at the best tier these graphics start at, now. */
  tryHigh(): void;
  /** The most draw calls a frame at the tier now may make (DRAW_BUDGET), for design/perf-probe.mjs. */
  budget(): number;
  /** The most the motion layer may add to a frame at the tier now (MOTION_BUDGET_MS, ms). */
  motionBudget(): number;
  /** Frame costs on request (./timing.ts), for design/perf-probe.mjs's motion A/B. */
  timing: FrameTiming;
}

/** Storage, where the browser has it (a private window or a sandbox may not). */
function storage(kind: 'localStorage' | 'sessionStorage'): Store | null {
  try {
    return window[kind];
  } catch {
    return null;
  }
}

/** How long (ms) the frames after each kind of one-off hitch are thrown away. */
export const SUSPEND = {
  /** A floor arriving: the deck is built, merged, and the other light mode's shaders compiled. */
  floor: 8_000,
  /** The tab coming back: the first frames after are a burst of catching up. */
  visible: 4_000,
  /** Night and Day, a tier change, a jump or a trip between decks. */
  change: 4_000,
  /** A burst of terminal output (TERM_BURST bytes inside a second), or a terminal's history arriving. */
  terminal: 4_000,
} as const;

/** This much terminal output (bytes) inside a second is a burst: xterm parses it on the main thread. */
const TERM_BURST = 64 * 1024;

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

export function installQuality(ctx: Ctx, parts: Pick<Parts, 'stage' | 'settings' | 'views' | 'peers' | 'lights' | 'space'>): Quality {
  const { renderer } = ctx;
  const name = rendererName(renderer.getContext());
  const local = storage('localStorage');
  const session = sessionId(storage('sessionStorage'));
  const top = autoTier(name);
  const gov = new Governor({ top, floor: floorFor(top), start: readCap(local, name, session, Date.now()) ?? top });
  let tier: Tier = tierOf(parts.settings.quality, gov.tier);
  let lastWall = 0;
  const fns = new Set<(tier: Tier, look: TierLook) => void>();
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

  function status(): QualityStatus {
    return { setting: parts.settings.quality, tier, top, last: gov.last ? { ...gov.last, wall: lastWall } : null };
  }
  let said = '';
  function publish() {
    const key = `${parts.settings.quality}|${tier}|${gov.last?.at ?? ''}`;
    if (key === said) return;
    said = key;
    publishQualityStatus(status(), tryHigh);
  }
  function suspend(ms: number = SUSPEND.change) {
    gov.suspend(performance.now(), ms);
  }
  function tryHigh() {
    clearCap(local);
    gov.reset(performance.now());
    if (parts.settings.quality !== 'auto') {
      parts.settings.quality = 'auto';
      saveSettings(parts.settings);
    }
    console.info(`Quality: trying ${top} again on ${name || 'these graphics'}`);
  }

  // What hitches once and says nothing about the frames after it: thrown away rather than judged.
  document.addEventListener('visibilitychange', () => suspend(SUSPEND.visible));
  ctx.messages.on('welcome', () => suspend(SUSPEND.floor));
  ctx.messages.on('term.snapshot', () => suspend(SUSPEND.terminal));
  let termAt = 0;
  let termBytes = 0;
  ctx.messages.on('term.data', (m) => {
    const now = performance.now();
    if (now - termAt > 1000) {
      termAt = now;
      termBytes = 0;
    }
    termBytes += m.data.length;
    if (termBytes >= TERM_BURST) {
      termBytes = 0;
      suspend(SUSPEND.terminal);
    }
  });
  let mode: string | null = null;

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
    // Night and Day, a jump under way, or a trip between decks: each recompiles or rebuilds once.
    const m = parts.lights?.mode() ?? null;
    if (m !== mode) {
      if (mode !== null) suspend();
      mode = m;
    }
    if ((parts.space && parts.space.phase() !== 'idle') || ctx.trip()) suspend();
    const want = tierOf(parts.settings.quality, gov.tier);
    if (want !== tier) {
      tier = want;
      apply();
      suspend();
    }
    // Auto: judged on the frames as they come, a tier at a time either way.
    if (parts.settings.quality === 'auto') {
      const step = gov.frame(now, delta * 1000);
      if (step) {
        lastWall = Date.now();
        writeCap(local, name, session, step.to, top, lastWall);
        console.info(`Quality: ${step.why} on ${name || 'these graphics'}, drawing at ${step.to}`);
      }
    }
    publish();
  });
  // The key light's shadow map: every frame, at a rate, or when something moves.
  ctx.ticks.add('hud', ({ now }) => {
    const every = TIER_LOOKS[tier].shadow.everyMs;
    const moved = every === null && movers();
    if (every === 0 || moved || (every !== null && now - drawnAt >= every)) renderer.shadowMap.needsUpdate = true;
    if (renderer.shadowMap.needsUpdate) drawnAt = now;
  });
  apply();
  publish();

  return {
    tier: () => tier,
    look: () => TIER_LOOKS[tier],
    on(fn) {
      fns.add(fn);
      fn(tier, TIER_LOOKS[tier]);
      return () => void fns.delete(fn);
    },
    renderer: () => name,
    suspend,
    status,
    tryHigh,
    budget: () => DRAW_BUDGET[tier],
    motionBudget: () => MOTION_BUDGET_MS[tier],
    timing: frameTiming(ctx),
  };
}
