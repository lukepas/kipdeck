// Coercing what a browser sends into what the office works with: a message's fields are whatever
// the page (or anyone else) put there, so every one is checked before it's used.
import { STOREY } from '../../shared/layout.js';

export const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
/** Which of a worker's repositories a Changes message is about: another floor's (see WorkerInfo.repos), or none for its own. */
export const repoOf = (v: unknown) => str(v, 64) || undefined;
export const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** A spot in the building: where someone stands, and which way they face. */
export interface Spot {
  x: number;
  y: number;
  z: number;
  rotY: number;
}

/** Where someone going to another floor says they arrive (see `floor.go`): in the building, or nowhere (the elevator). */
export function arrivalSpot(at: unknown): Spot | undefined {
  if (!at || typeof at !== 'object') return undefined;
  const a = at as Record<string, unknown>;
  const clamp = (v: unknown, lo: number, hi: number) => Math.min(hi, Math.max(lo, num(v)));
  // Down a shaft on the ladder or a pole, as far down as the floor below.
  return { x: clamp(a.x, -60, 60), y: clamp(a.y, -STOREY - 1, 10), z: clamp(a.z, -60, 60), rotY: num(a.rotY) };
}
/** The spot someone coming back in says they were standing in (see Net.connect), if they say. */
export function spotFrom(q: URLSearchParams): ReturnType<typeof arrivalSpot> {
  const n = (k: string) => (q.get(k) ? Number(q.get(k)) : NaN);
  const [x, y, z, rotY] = ['x', 'y', 'z', 'rotY'].map(n);
  return Number.isFinite(x) && Number.isFinite(z) ? arrivalSpot({ x, y, z, rotY }) : undefined;
}
export const issueNumber = (v: unknown) => (Number.isInteger(v) && (v as number) > 0 ? (v as number) : undefined);
export const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
