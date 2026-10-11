import type { ApprovalView } from '../../../shared/protocol';
import type { Slice } from '../store';

declare module '../store' {
  interface Store {
    /** The open permission requests, by the agent asking (see protocol/approvals.ts): one per agent at a time. */
    approvals: Map<string, ApprovalView>;
  }
  interface Topics {
    approvals: true;
  }
}

/** Approvals: what each agent is asking permission for, from its hook, while the inbox is open. */
export const approvals: Slice = {
  init(s) {
    s.approvals = new Map();
  },
  on: {
    approvals(s, m) {
      s.approvals = new Map(m.items.map((a) => [a.workerId, a]));
      return ['approvals'];
    },
  },
};
