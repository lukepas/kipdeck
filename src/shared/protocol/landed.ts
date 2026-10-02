// Work landing on a floor: a pull request merged, the task queue finished. Not a mission's
// milestone (protocol/mission.ts): this is the celebration when something lands.

/** What landed: pull request `pr` merged, or the last task on the queue just finished. */
export type Landing = 'merged' | 'queue';

export type LandedServerMsg =
  /** For everyone on the floor. `by` merged it from the PR window, when someone did. */
  { t: 'landed'; kind: Landing; by?: string; pr?: number };
