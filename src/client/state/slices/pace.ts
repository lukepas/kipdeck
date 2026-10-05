import type { PaceState } from '../../../shared/protocol';
import type { Slice } from '../store';

declare module '../store' {
  interface Store {
    /** The pace of the deck you're on, once asked for (the drive core and the pit wall ask; see protocol/pace.ts). */
    pace: { floor: string; state: PaceState } | null;
  }
  interface Topics {
    pace: true;
  }
}

/** The deck's pace: the drive core's run, the fleet's week and the captain's turnaround. */
export const pace: Slice = {
  init(s) {
    s.pace = null;
  },
  on: {
    pace(s, m) {
      if (m.floor !== s.floor) return;
      s.pace = { floor: m.floor, state: m.pace };
      return ['pace'];
    },
  },
  enter(s) {
    s.pace = null;
    return ['pace'];
  },
};
