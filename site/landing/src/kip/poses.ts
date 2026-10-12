// Kip's poses, pivots and wand safety, as in the deck (deck/site/kip.js).

import { NEUTRAL, POSES, ORIGINS, mix, type PartVars, type Pose, type PoseName } from '../../../../src/shared/kip-art.ts';

export { NEUTRAL, POSES, ORIGINS, mix, type PartVars, type Pose, type PoseName };

// ---------- the wand never crosses his face ----------
// The rod's points (mid, tip, chevron apex) in body units for an arm and Sprig rotation. Every arm
// move picks the nearest Sprig angle that keeps those points off the head (an ellipse around the
// face, plus the ears).

type P = [number, number];
export const ROD_PTS: P[] = [[74.5, 83.7], [78.6, 77.4], [79.8, 75.55]];
function rotP(p: P, o: P, d: number): P {
  const a = (d * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), x = p[0] - o[0], y = p[1] - o[1];
  return [o[0] + x * c - y * s, o[1] + x * s + y * c];
}
export function onHead(p: P): boolean {
  const [x, y] = p;
  return Math.pow((x - 51) / 25.5, 2) + Math.pow((y - 54.5) / 23, 2) < 1 || (x > 30 && x < 70 && y < 37);
}
/** The rod's points for an arm and wand rotation, in body units. */
export function rodAt(arm: number, spr: number): P[] {
  return ROD_PTS.map((p) => rotP(rotP(p, [70, 95], spr), [65, 80], arm));
}
export function sprigSafe(arm: number, spr: number): boolean {
  return !rodAt(arm, spr).some(onHead);
}
export function sprigFor(arm: number, base = 0): number {
  for (let d = 0; d <= 180; d += 5) {
    if (sprigSafe(arm, base + d)) return base + d;
    if (d && sprigSafe(arm, base - d)) return base - d;
  }
  return base;
}

// ---------- which glow is lit ----------
export type Sprig = 'green' | 'teal' | 'cyan' | 'rose' | 'dim' | 'off';
const glowOf = (c: Sprig) => (c === 'cyan' || c === 'teal' ? 'teal' : 'green');
export function glowOn(c: Sprig, g: string): number {
  return c === 'off' ? 0 : c === 'dim' ? (g === 'green' ? 0.28 : 0) : glowOf(c) === g ? 1 : 0;
}
