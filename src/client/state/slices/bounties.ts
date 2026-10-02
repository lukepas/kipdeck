import type { BountiesState, ChainSettingsState } from '../../../shared/protocol';
import type { Slice } from '../store';

declare module '../store' {
  interface Store {
    /** Proof of Merge bounties, by floor id (every floor: the review inbox spans them). */
    bounties: Record<string, BountiesState>;
    /** The bounty settings, once ⚙️ Settings asked for them (see protocol/bounties.ts). */
    bountySettings?: ChainSettingsState;
  }
  interface Topics {
    bounties: true;
    bountySettings: true;
  }
}

/** Bounties on each floor's issues, and their settings. */
export const bounties: Slice = {
  init(s) {
    s.bounties = {};
    s.bountySettings = undefined;
  },
  on: {
    bounties(s, m) {
      s.bounties = { ...s.bounties, [m.floor]: m.state };
      return ['bounties'];
    },
    'bounty.settings'(s, m) {
      s.bountySettings = m.state;
      return ['bountySettings'];
    },
  },
  enter(s, v) {
    if (v.floor && v.bounties) s.bounties = { ...s.bounties, [v.floor]: v.bounties };
    return ['bounties'];
  },
};
