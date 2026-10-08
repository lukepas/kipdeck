/**
 * The Overview's own light. The deck's polished surfaces (the mission table's top, the consoles, the
 * floor) go matte as the view rises into the Overview. On the way up the camera sweeps through the key
 * light's mirror angle off them: for a few frames the table top throws the whole key back into the
 * lens and the glow blooms it over the middle of the deck, a flash of 15 or more in the frame's mean
 * brightness. From up there a matte deck looks the same as a polished one (the key's reflection points
 * away from the camera), so the roughness is raised to MATTE along the first stretch of the move and
 * stays there while the Overview is up; on the way down it comes back over the last stretch, unless
 * something else (a Quality tier, a light mode) changed it meanwhile. A unit that comes on the deck
 * while the Overview is up goes matte too, within a second. Roughness is a uniform: nothing recompiles.
 *
 * And with the gloss gone the plan reads dark and flat from up there, so the exposure rises by
 * OVERVIEW_LIFT as the view goes up (the same progress()), and comes back down with it: the units,
 * consoles and pods read apart from the floor, in the same navy and cyan.
 */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { smoothstep } from '../../core/overview-transition';

/** The roughness every polished surface is raised to from above. */
export const MATTE = 0.45;
/** How far along the move up (its eased progress) the surfaces have gone fully matte. */
export const MATTE_BY = 0.3;
/** How much brighter the exposure is from the Overview: a quarter. */
export const OVERVIEW_LIFT = 0.25;
/** How often (ms) the materials are looked for again while the Overview is up: a unit may come on the deck meanwhile. */
export const AGAIN_MS = 1000;

/** The roughness a surface of roughness `r` has with the view `up` of the way into the Overview (0-1). */
export function glossAt(r: number, up: number): number {
  const k = smoothstep(0, MATTE_BY, up);
  return r >= MATTE ? r : r + (MATTE - r) * k;
}

export class Gloss {
  /** Each polished material and its own roughness. */
  private readonly own = new Map<THREE.MeshStandardMaterial, number>();
  private last = 0;
  private collectedAt = -Infinity;

  constructor(private readonly scene: THREE.Object3D) {}

  /** Finds the polished materials afresh (a move is starting, or a unit or a fixture may have come since). */
  private collect() {
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
        if (!(mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) continue;
        const s = mat as THREE.MeshStandardMaterial;
        if (!this.own.has(s) && s.roughness < MATTE) this.own.set(s, s.roughness);
      }
    });
  }

  /** Sets every polished surface for the view `up` of the way into the Overview (`now` in ms). */
  update(up: number, now = performance.now()) {
    const stale = up > 0 && now - this.collectedAt > AGAIN_MS;
    if (up === this.last && !stale) return;
    if (this.last === 0 || stale) {
      this.collect();
      this.collectedAt = now;
    }
    for (const [m, r] of this.own) {
      // Changed by something else since this last set it: that's its roughness now.
      if (Math.abs(m.roughness - glossAt(r, this.last)) > 1e-6) {
        this.own.set(m, m.roughness);
        if (m.roughness >= MATTE) continue;
      }
      m.roughness = glossAt(this.own.get(m)!, up);
    }
    this.last = up;
    // Back in Walk: let go of them, so a material disposed meanwhile isn't held.
    if (up === 0) this.own.clear();
  }
}

/**
 * `exposure` lifted for the view `up` of the way into the Overview: by OVERVIEW_LIFT once it's up.
 */
export function exposureAt(exposure: number, up: number): number {
  return exposure * (1 + OVERVIEW_LIFT * smoothstep(0, 1, up));
}

/** The gloss and the exposure following the Overview's move, frame by frame. */
export function installGloss(ctx: Ctx, parts: Pick<Parts, 'overview'>) {
  const gloss = new Gloss(ctx.scene);
  /** The exposure the light rig set (features/lights), and the one set here last. */
  let base = ctx.renderer.toneMappingExposure;
  let mine = base;
  ctx.ticks.add('world', ({ now }) => {
    const up = parts.overview?.progress() ?? 0;
    gloss.update(up, now);
    // Set by the rig since (a light mode, Brightness): that's the base now.
    if (ctx.renderer.toneMappingExposure !== mine) base = ctx.renderer.toneMappingExposure;
    mine = exposureAt(base, up);
    ctx.renderer.toneMappingExposure = mine;
  });
}
