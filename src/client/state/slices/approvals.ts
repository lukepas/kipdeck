import type { ApprovalView } from '../../../shared/protocol';
import type { Slice } from '../store';

declare module '../store' {
  interface Store {
    /** Each asking agent's open permission requests, oldest first (see protocol/approvals.ts). */
    approvals: Map<string, ApprovalView[]>;
  }
  interface Topics {
    approvals: true;
  }
}

/** Approvals: what each agent is asking permission for, from its hook. */
export const approvals: Slice = {
  init(s) {
    s.approvals = new Map();
  },
  on: {
    approvals(s, m) {
      const by = new Map<string, ApprovalView[]>();
      for (const a of [...m.items].sort((x, y) => x.at - y.at)) by.set(a.workerId, [...(by.get(a.workerId) ?? []), a]);
      s.approvals = by;
      return ['approvals'];
    },
  },
};
