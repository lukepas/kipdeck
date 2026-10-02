import type { Ctx } from '../../core/context';
import { Arcade } from './ui';

/** The boss's monitor upstairs: Minesweeper, from the boss's chair (the chair's E plays it, see features/seating). */
export function installArcade(ctx: Ctx): Arcade {
  // The boss's monitor upstairs: Minesweeper, from the boss's chair.
  const arcade = new Arcade(ctx.office.bossScreen);
  ctx.ticks.add('play', ({ dt }) => arcade.update(ctx.camera, dt));
  return arcade;
}
