import type { SpendState } from '../../../shared/protocol';
import type { Slice } from '../store';

declare module '../store' {
  interface Store {
    /** Today's spend, the budget caps and each project's default mode (see server/spend/); undefined until asked for. */
    spend?: SpendState;
  }
  interface Topics {
    spend: true;
  }
}

/** Spend and control: asked for with spend.get (the inbox on its welcome, Settings as it opens). */
export const spend: Slice = {
  init(s) {
    s.spend = undefined;
  },
  on: {
    spend(s, m) {
      s.spend = m.state;
      return ['spend'];
    },
  },
};
