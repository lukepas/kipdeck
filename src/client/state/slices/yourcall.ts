import type { YourCallFloor, YourCallServerMsg } from '../../../shared/protocol';

type Reply = Omit<Extract<YourCallServerMsg, { t: 'yourcall.answered' }>, 't'>;
import type { Slice } from '../store';

declare module '../store' {
  interface Store {
    /** Every project's open decisions and next step, as the office last said (protocol/yourcall.ts). */
    yourCall: YourCallFloor[];
    /** How this page's last answer went, when one came back. */
    yourCallReply: Reply | null;
  }
  interface Topics {
    yourcall: true;
    yourcallReply: true;
  }
}

/** Your call: the open decisions in each project's .rundown/decisions.md, and the map's next step. */
export const yourCall: Slice = {
  init(s) {
    s.yourCall = [];
    s.yourCallReply = null;
  },
  on: {
    yourcall(s, m) {
      s.yourCall = m.floors;
      return ['yourcall'];
    },
    'yourcall.answered'(s, m) {
      const { t: _t, ...reply } = m;
      s.yourCallReply = reply;
      return ['yourcallReply'];
    },
  },
};
