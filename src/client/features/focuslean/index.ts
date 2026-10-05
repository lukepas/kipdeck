/**
 * The focus lean: from the conn (in the captain's chair, or standing on the dais in mouse-look), rest
 * the crosshair on a wall board for 350 ms and the view leans in on it, the field of view easing from
 * 55 to 38 degrees over 600 ms, so its rows read without walking up to it. Any mouse move over 2 px, a
 * key, or the crosshair leaving the board eases it back out over 400 ms. With less motion (the system's
 * setting, or Ship motion Off) it cuts instead of easing. It goes through the camera's zoom
 * (core/zoom.ts), as the jump's framing does.
 */
import { CONN } from '../../../shared/layout';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { zoomOf } from '../../core/zoom';
import { modalOpen } from '../../ui/dom';
import { REST, leanDegrees, leanStep, type LeanState } from './logic';

export function installFocusLean(ctx: Ctx, parts: Pick<Parts, 'boardFaces' | 'player' | 'stage'>) {
  let moved = 0;
  let key = false;
  window.addEventListener('mousemove', (e) => void (moved += Math.abs(e.movementX) + Math.abs(e.movementY)));
  window.addEventListener('keydown', () => void (key = true));
  let state: LeanState = REST;
  ctx.ticks.add('world', ({ dt }) => {
    const p = parts.player;
    const seated = p.seat?.seatId === 'conn';
    const standing = !p.seat && document.pointerLockElement === ctx.canvas && Math.hypot(p.pos.x - CONN.x, p.pos.z - CONN.z) <= CONN.r + 0.2;
    const atConn = (seated || standing) && p.view === 'first' && !parts.stage.view && !modalOpen();
    state = leanStep(state, { dt, onBoard: atConn && !!parts.boardFaces?.aimed(), moved, key, still: ctx.reduceMotion.matches });
    moved = 0;
    key = false;
    zoomOf(ctx.camera).set('lean', leanDegrees(state.t));
  });
}
