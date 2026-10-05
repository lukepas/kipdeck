// The deck's pace and the start of watch: the drive core's run, the fleet's week against its record,
// the captain's turnaround (shared/pace.ts, shared/turnaround.ts), and the day's captain's log
// (shared/launch.ts), which the server writes to the timeline once a day per deck.

import type { FleetWeek, Run } from '../pace.js';
import type { Turnaround } from '../turnaround.js';
import type { TimelineEvent } from './timeline.js';

/** A deck's pace, as the server works it out from its timeline (outcomes only). */
export interface PaceState extends Run, FleetWeek, Turnaround {
  /** Day of the mission on this deck. */
  day: number;
}

export type PaceClientMsg =
  /** This deck's pace; answered with 'pace'. */
  | { t: 'pace.get'; floor: string }
  /**
   * The captain starts a watch on this deck: the server writes today's captain's log to its timeline,
   * once a day, and answers with 'log' (today's entry, new or the one already written).
   */
  | { t: 'log.write'; floor: string };

export type PaceServerMsg =
  /** A deck's pace, to whoever asked. */
  | { t: 'pace'; floor: string; pace: PaceState }
  /** Today's captain's log on a deck, to whoever started the watch. */
  | { t: 'log'; floor: string; event: TimelineEvent };
