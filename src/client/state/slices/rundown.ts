import type { Rundown } from '../../../shared/rundown/schema';
import type { Slice } from '../store';

/** One floor's rundown as the office last sent it. */
export interface RundownView {
  rundown: Rundown | null;
  computing: boolean;
  error?: string;
}

declare module '../store' {
  interface Store {
    /** Rundowns of the floors this page watches (Labs > Rundown), by floor id. */
    rundowns: Map<string, RundownView>;
  }
  interface Topics {
    rundown: true;
  }
}

/** Rundown (Labs): what the office says about each watched floor's map. */
export const rundown: Slice = {
  init(s) {
    s.rundowns = new Map();
  },
  on: {
    'rundown.state'(s, m) {
      s.rundowns.set(m.floor, { rundown: m.rundown, computing: m.computing, error: m.error });
      return ['rundown'];
    },
  },
};
