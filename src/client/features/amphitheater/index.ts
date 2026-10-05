/**
 * The amphitheatre: the deck stepped up in tiers from the pit to the conn's dais, and the situation arc
 * hung over the pit (shared/amphitheater.ts; its fixtures are tiers.ts and arc.ts, built with the rest
 * of the floor). This is the captain's framing on it: sitting down in the captain's chair, the field of
 * view closes from 55 to 50 degrees and the view is aimed low on the arc (FRAMING.aim of the way up), so
 * the bow and the arc fill the top half of the frame and the pit and the tiers with the crew the bottom
 * half, at a glance. You can still look anywhere, and the focus lean (features/focuslean) still leans in
 * on one board from there. Getting up, or the Overview, gives the view its own field back.
 */
import { ARC } from '../../../shared/amphitheater';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { zoomOf } from '../../core/zoom';
import { EYE_HEIGHT } from '../../player/camera';
import { HIPS } from '../../world/character/rig';
import { FRAMING, seatedPitch } from './framing';

export function installAmphitheater(ctx: Ctx, parts: Pick<Parts, 'player' | 'stage'>) {
  let wasSeated = false;
  ctx.ticks.add('world', () => {
    const p = parts.player;
    const seated = p.seat?.seatId === 'conn';
    if (seated && !wasSeated && p.view === 'first' && p.seat) {
      p.lookPitch = seatedPitch(p.seat.y + EYE_HEIGHT + p.seat.hips - HIPS, p.seat.z, ARC);
      p.updateCamera(true);
    }
    wasSeated = seated;
    const framed = seated && p.view === 'first' && !parts.stage.view;
    zoomOf(ctx.camera).set('seat', framed ? FRAMING.fov - FRAMING.base : 0);
  });
}
