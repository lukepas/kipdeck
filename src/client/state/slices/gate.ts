import { emptyGate, type GateState } from '../../../shared/gate';
import type { Slice } from '../store';

declare module '../store' {
  interface Store {
    /** The agent gate (see shared/gate.ts): agents' requests waiting for a person, the grants, the record. */
    gate: GateState;
  }
  interface Topics {
    gate: true;
  }
}

/** The agent gate: what agents ask to do to other agents, as the office last said. */
export const gate: Slice = {
  init(s) {
    s.gate = emptyGate();
  },
  on: {
    welcome(s, m) {
      if (!m.gate) return [];
      s.gate = m.gate;
      return ['gate'];
    },
    gate(s, m) {
      s.gate = m.state;
      return ['gate'];
    },
  },
};
