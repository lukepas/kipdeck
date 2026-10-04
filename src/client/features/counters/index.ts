/**
 * The counters on the 3D office's top bar (ui/counters.ts, which the 2D view shares): each opens
 * Mission control on the tab for its level.
 */
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { $ } from '../../ui/dom';
import { mountCounters } from '../../ui/counters';

export type CountersParts = Pick<Parts, 'mission'>;

export function installCounters(_ctx: Ctx, parts: CountersParts) {
  mountCounters($('counters'), (tab) => parts.mission.showMission(tab));
}
