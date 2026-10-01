// The balcony's golf tee, and the gong.

/** Why the gong rang. */
export type GongWhy = 'hit' | 'merged' | 'queue';

export type RooftopClientMsg =
  /**
   * You hit a golf ball off the tee: its heading (0 is south, toward +x from there), loft (radians)
   * and power (0–1). Everyone on your floor works out where it goes the same way (features/golf/world.ts fly).
   */
  | { t: 'golf'; yaw: number; loft: number; power: number }
  /** Hit the office gong (E at the gong); everyone on the floor hears it. */
  | { t: 'gong' };

export type RooftopServerMsg =
  /** Someone on your floor hit a golf ball off the tee (see the client's 'golf'). */
  | { t: 'golf'; id: string; yaw: number; loft: number; power: number }
  /**
   * The gong rings, for everyone on the floor: someone hit it, pull request `pr` merged (confetti
   * over the desk it came from), or the last task on the queue just finished (a bigger party).
   */
  | { t: 'gong'; why: GongWhy; by?: string; pr?: number };
