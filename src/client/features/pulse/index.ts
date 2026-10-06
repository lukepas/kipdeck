/**
 * The bridge's pulse: the motion design layer that keeps the room alive at rest, in the top of the
 * captain's frame where nothing is read. Every 7 s a wave of light leaves the halo over the table and
 * runs out along the canopy's ribs to the eaves, turning round the dome like a radar's sweep; a glint
 * turns round the halo every 5 s (signal orange while someone needs the captain); and at High a wake of
 * lit dust streams over the glass from the bow, so the ship is seen making way.
 *
 * All of it runs on the GPU from one clock: two draws at High, one at Medium, none at Low, and no
 * per-frame work on the CPU but a few uniforms. Ship motion Off and reduced motion hide it, Calm
 * halves it, a call takes it to half, and a hidden tab draws no frames.
 */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { DECK } from '../../world/office/materials';
import { PANEL } from '../boards/world';
import { pulseLevel } from './logic';
import { ribWave, wake } from './world';

export function installPulse(ctx: Ctx, parts: Pick<Parts, 'quality' | 'giveWay'>) {
  const ribs = ribWave();
  const trail = wake();
  ctx.scene.add(ribs.mesh, trail.mesh);
  const cyan = new THREE.Color(DECK.ship);
  const orange = new THREE.Color(PANEL.signal);
  let t = 0;
  let level = 0;
  ctx.ticks.add('world', ({ dt }) => {
    const look = parts.quality.look().pulse;
    const attention = parts.giveWay?.attention() ?? false;
    const want = look ? pulseLevel({ still: ctx.reduceMotion.matches, ship: ctx.reduceMotion.ship, visible: document.visibilityState !== 'hidden', attention }) : 0;
    // Eased, so a call or a setting fades it rather than cutting it.
    level += (want - level) * Math.min(1, dt * 3);
    if (want === 0 && level < 0.01) level = 0;
    t += dt;
    ribs.mesh.visible = level > 0;
    trail.mesh.visible = level > 0 && look === 'full';
    ribs.uniforms.uT.value = t;
    trail.uniforms.uT.value = t;
    ribs.uniforms.uLevel.value = level;
    trail.uniforms.uLevel.value = level;
    (ribs.uniforms.uGlint.value as THREE.Color).copy(attention ? orange : cyan);
  });
}
