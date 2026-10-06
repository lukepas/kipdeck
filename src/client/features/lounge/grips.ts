// Where your hands are on the lounge's ladder while you climb it, in the deck's own metres, as plain
// numbers for the tests (tests/lounge.test.ts). Each hand is planted on a rung, near its stringer, and
// stays there while your body moves past it. Once the lower hand is down at your chest (on the way up),
// or the upper one is well over your head (on the way down), it lets go and goes over the other to the
// next rung in GRIP.lift seconds, pulled back toward you as it goes; it lands with the rung's clank. Over
// the balcony the ladder's stringers stand on as grab posts, and the hands climb those. Upstream
// agent-office's ladder plants its hands the same way (origin/main features/climbing, MIT).

import { LADDER, LOUNGE } from '../../../shared/lounge';

/**
 * How long a hand takes to go over to the next rung (s); how far under your eyes the lower hand gets
 * before it lets go on the way up, and how far over them the upper one on the way down (m); how far in
 * from the stringers a hand holds a rung (m); and how far back toward you a moving hand swings (m).
 */
export const GRIP = { lift: 0.15, under: 0.12, over: 0.5, inset: 0.19, swing: 0.07 } as const;

/** The ladder's face, where the rungs are (world/lounge's lz), and the highest place a hand holds (on the grab posts). */
export const FACE_Z = LOUNGE.z1 + 0.08;
const TOP_RUNG = Math.floor((LOUNGE.top + LADDER.posts * 0.8) / LADDER.rung + 1e-6);
/** The first rung a hand holds: the ladder's lowest is at one spacing up. */
const LOW_RUNG = 1;

export interface P3 {
  x: number;
  y: number;
  z: number;
}

/** A hand: the rung it holds (or is going to), and while it moves, the one it left and how far along it is (0 to 1). */
interface Hand {
  rung: number;
  from: number;
  k: number;
}

/** The height of rung `i` (the grab posts carry on at the same spacing over the balcony). */
export const rungY = (i: number) => i * LADDER.rung;

/** Where a hand holds rung `i`, on side `side` (1 right, -1 left, facing the ladder: the bow). */
export function rungPoint(i: number, side: 1 | -1, out: P3): P3 {
  // On the rungs a little in from each stringer; over the balcony, on the posts themselves.
  const post = rungY(i) > LOUNGE.top - 0.05;
  out.x = LADDER.x + side * (post ? LADDER.width / 2 : LADDER.width / 2 - GRIP.inset);
  out.y = rungY(i);
  out.z = FACE_Z + 0.03;
  return out;
}

const scratch: P3 = { x: 0, y: 0, z: 0 };
const smooth = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** Both hands on the ladder, from where your eyes are when you take hold of it. */
export class Grips {
  readonly right: Hand;
  readonly left: Hand;

  constructor(eyeY: number) {
    // The lower hand on the first rung over your chest, the other one up.
    const low = Math.max(LOW_RUNG, Math.min(TOP_RUNG - 1, Math.ceil((eyeY - GRIP.under) / LADDER.rung + 1e-6)));
    this.right = { rung: low, from: low, k: 1 };
    this.left = { rung: low + 1, from: low + 1, k: 1 };
  }

  /** How high your hands are between them (m): where your eyes follow them up the ladder. */
  middle(): number {
    return (this.point(1, scratch).y + this.point(-1, scratch).y) / 2;
  }

  /** Whether either hand is between rungs. */
  moving(): boolean {
    return this.right.k < 1 || this.left.k < 1;
  }

  /**
   * A frame: `dt` seconds, your eyes at `eyeY`, going `dir` (1 up, -1 down). `still` (less motion) moves
   * a hand at once. Calls `landed` as a hand closes on its next rung.
   */
  step(dt: number, eyeY: number, dir: 1 | -1, still: boolean, landed: () => void) {
    for (const h of [this.right, this.left]) {
      if (h.k >= 1) continue;
      h.k = still ? 1 : Math.min(1, h.k + dt / GRIP.lift);
      if (h.k >= 1) landed();
    }
    if (this.moving()) return;
    // One hand at a time: the lower on the way up, the upper on the way down.
    const [low, high] = this.right.rung <= this.left.rung ? [this.right, this.left] : [this.left, this.right];
    if (dir > 0 && rungY(low.rung) < eyeY - GRIP.under) {
      const to = Math.min(TOP_RUNG, high.rung + 1);
      if (to > low.rung) this.go(low, to, still, landed);
    } else if (dir < 0 && rungY(high.rung) > eyeY + GRIP.over) {
      const to = Math.max(LOW_RUNG, low.rung - 1);
      if (to < high.rung) this.go(high, to, still, landed);
    }
  }

  private go(h: Hand, to: number, still: boolean, landed: () => void) {
    h.from = h.rung;
    h.rung = to;
    h.k = still ? 1 : 0;
    if (still) landed();
  }

  /** Where hand `side` is now: on its rung, or on its way over, swung back toward you. */
  point(side: 1 | -1, out: P3): P3 {
    const h = side > 0 ? this.right : this.left;
    rungPoint(h.rung, side, out);
    if (h.k >= 1) return out;
    const k = smooth(h.k);
    const fromY = rungY(h.from);
    out.y = fromY + (out.y - fromY) * k;
    out.z += Math.sin(Math.PI * k) * GRIP.swing;
    return out;
  }
}
