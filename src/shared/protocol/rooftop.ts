// The gong.

/** Why the gong rang. */
export type GongWhy = 'hit' | 'merged' | 'queue';

export type RooftopClientMsg =
  /** Hit the office gong (E at the gong); everyone on the floor hears it. */
  | { t: 'gong' };

export type RooftopServerMsg =
  /**
   * The gong rings, for everyone on the floor: someone hit it, pull request `pr` merged (confetti
   * over the desk it came from), or the last task on the queue just finished (a bigger party).
   */
  | { t: 'gong'; why: GongWhy; by?: string; pr?: number };
