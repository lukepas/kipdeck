/**
 * The seated frame: sat in the captain's chair in first person, the view is centred on the canvas you
 * can see right of the Units rail rather than on the whole window, so the arc's port wing is never
 * under the rail (at 1440x900 with the rail open, the Issues board lost its first letters). It moves the
 * camera's principal point (a view offset, no extra pass), half the rail's width, sliding over a few
 * frames when the rail opens or folds (a cut with less motion). Standing, in the Overview, or with
 * the rail folded away the frame is the window's own again.
 */
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { frameShift, slideShift } from './logic';

/** How often the rail's width is read (s): layout is never read every frame. */
const POLL = 0.4;

export function installSeatFrame(ctx: Ctx, parts: Pick<Parts, 'player' | 'stage'>) {
  const camera = ctx.camera;
  let railPx = 0;
  let since = POLL;
  let shift = 0;
  let applied = { shift: 0, w: 0, h: 0 };
  const rail = () => document.getElementById('rail');
  ctx.ticks.add('aim', ({ dt }) => {
    since += dt;
    if (since >= POLL) {
      since = 0;
      const el = rail();
      railPx = el && el.offsetParent !== null ? el.getBoundingClientRect().width : 0;
    }
    const p = parts.player;
    const seated = p.seat?.seatId === 'conn' && p.view === 'first' && !parts.stage.view;
    shift = slideShift(shift, frameShift(railPx, seated), dt, ctx.reduceMotion.matches);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const s = Math.round(shift);
    if (s === applied.shift && w === applied.w && h === applied.h) return;
    applied = { shift: s, w, h };
    if (s === 0) camera.clearViewOffset();
    else camera.setViewOffset(w, h, -s, 0, w, h);
  });
}
