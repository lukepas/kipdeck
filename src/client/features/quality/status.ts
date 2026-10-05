/**
 * What Settings and the HUD menu say about Quality: the tier drawn now, whether Auto picked it, and
 * Auto's last step with its reason and time. features/quality publishes it; the chip in Settings >
 * Bridge > Quality (ui/quality-settings.ts) and the Quality row in the HUD menu (./menu.ts) read it
 * and repaint when it changes. Three.js-free, so tests read the same words.
 */
import type { Quality } from '../../state/persist';
import type { Step } from './governor';
import type { Tier } from './tiers';

export interface QualityStatus {
  /** What Settings is set to. */
  setting: Quality;
  /** The tier drawn now. */
  tier: Tier;
  /** The best Auto climbs to on these graphics. */
  top: Tier;
  /** Auto's last step, if it took one (a wall-clock time, for the words). */
  last: (Step & { wall: number }) | null;
}

export const TIER_NAME: Readonly<Record<Tier, string>> = { high: 'High', medium: 'Medium', low: 'Low' };

let current: QualityStatus | null = null;
const fns = new Set<(s: QualityStatus) => void>();
let tryHighFn: (() => void) | null = null;

/** Called by features/quality whenever any of it changes. */
export function publishQualityStatus(s: QualityStatus, tryHigh: () => void) {
  current = s;
  tryHighFn = tryHigh;
  for (const fn of fns) fn(s);
}

/** The status now, or null before the 3D deck has started. */
export function qualityStatus(): QualityStatus | null {
  return current;
}

/** Calls `fn` on every change until the returned function is called. */
export function onQualityStatus(fn: (s: QualityStatus) => void): () => void {
  fns.add(fn);
  return () => void fns.delete(fn);
}

/** Forgets Auto's cap and draws at the top tier again, now. */
export function tryHigh() {
  tryHighFn?.();
}

/** The chip's words: 'Auto - running at High', or 'High' for a tier picked by hand. */
export function chipText(s: QualityStatus): string {
  return s.setting === 'auto' ? `Auto - running at ${TIER_NAME[s.tier]}` : `${TIER_NAME[s.tier]}, picked by hand`;
}

/** Auto's last step in words: 'stepped to Medium at 14:02, slow frames', or '' when it hasn't stepped. */
export function stepText(s: QualityStatus): string {
  if (s.setting !== 'auto' || !s.last) return '';
  const d = new Date(s.last.wall);
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `stepped ${s.last.dir === 'up' ? 'up ' : ''}to ${TIER_NAME[s.last.to]} at ${hhmm}, ${s.last.why}`;
}

/** Whether 'Try High' has anything to do: Auto running under the best these graphics draw. */
export function canTryHigh(s: QualityStatus): boolean {
  return s.setting === 'auto' && s.tier !== s.top;
}
