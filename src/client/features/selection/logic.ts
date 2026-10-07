// The pure parts of selecting a unit (features/selection): telling a click from a drag, and which
// buttons the inspector card offers for a unit at each level of the building's one ranking
// (shared/attention.ts). No DOM and no three.js, so the tests run them under node.

import type { AttentionLevel } from '../../../shared/attention';

/** A press is a click when the pointer moved less than this (px) between down and up... */
export const CLICK_SLOP_PX = 5;
/** ...and was let go within this (ms). Anything else is a drag (the Overview pans on a drag). */
export const CLICK_MS = 300;

export interface Press {
  x: number;
  y: number;
  /** When (ms, any one clock). */
  t: number;
}

/** Whether a press from `down` to `up` was a click or a drag. */
export function classifyPress(down: Press, up: Press): 'click' | 'drag' {
  const moved = Math.hypot(up.x - down.x, up.y - down.y);
  return moved < CLICK_SLOP_PX && up.t - down.t < CLICK_MS ? 'click' : 'drag';
}

/** What a button on the inspector card does. */
export type InspectAction = 'answer' | 'review' | 'terminal' | 'changes';

export interface InspectButton {
  action: InspectAction;
  label: string;
  /** The one button that answers the unit's state (drawn filled); the rest are plain. */
  primary: boolean;
}

/**
 * The buttons for a unit at `level`: the one thing its state asks for, first and filled, so the
 * answer is a click away without hunting. A unit at work (or ready) gets its terminal and its changes.
 */
export function buttonsFor(level: AttentionLevel): InspectButton[] {
  switch (level) {
    case 'needs-you':
      return [{ action: 'answer', label: 'Answer', primary: true }];
    case 'review':
      return [{ action: 'review', label: 'Review changes', primary: true }];
    case 'stuck':
      return [{ action: 'terminal', label: 'Open terminal', primary: true }];
    default:
      return [
        { action: 'terminal', label: 'Terminal', primary: false },
        { action: 'changes', label: 'Changes', primary: false },
      ];
  }
}

/** A live elapsed time for the card, to the second while it's short: '42s', '4m 07s', '2h 05m', '3d 4h'. */
export function elapsed(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** Eases out on a cubic: fast in, settling (the reticle's lock-on). */
export const easeOutCubic = (k: number) => 1 - (1 - Math.min(1, Math.max(0, k))) ** 3;
