// Milestones on a floor: a pull request merged, the task queue finished.

/** What happened: pull request `pr` merged, or the last task on the queue just finished. */
export type Milestone = 'merged' | 'queue';

export type MilestoneServerMsg =
  /** For everyone on the floor. `by` merged it from the PR window, when someone did. */
  { t: 'milestone'; kind: Milestone; by?: string; pr?: number };
