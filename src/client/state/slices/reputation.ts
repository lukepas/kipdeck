import type { ReputationState } from '../../../shared/protocol';
import type { Slice } from '../store';

declare module '../store' {
  interface Store {
    /** The agents' merge-based records (Mission control asks for them; see protocol/reputation.ts). */
    reputation?: ReputationState;
  }
  interface Topics {
    reputation: true;
  }
}

/** Merge-based agent reputation, once Mission control asked, and whenever it changes. */
export const reputation: Slice = {
  init(s) {
    s.reputation = undefined;
  },
  on: {
    reputation(s, m) {
      s.reputation = m.state;
      return ['reputation'];
    },
  },
};
