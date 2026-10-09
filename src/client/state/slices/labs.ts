import { labOn, type LabId, type LabsState } from '../../../shared/labs';
import type { Slice } from '../store';

declare module '../store' {
  interface Store {
    /** Which labs are on (see shared/labs.ts); undefined until the welcome, which counts as all off. */
    labs?: LabsState;
    /** Is this lab on? Off until the office says otherwise. */
    lab(id: LabId): boolean;
  }
  interface Topics {
    labs: true;
  }
}

/** Labs: the parts beyond the inbox, each on until an admin switches it off. */
export const labs: Slice = {
  init(s) {
    s.labs = undefined;
  },
  methods: {
    lab(id) {
      return labOn(this.labs, id);
    },
  },
  on: {
    welcome(s, m) {
      s.labs = m.labs;
      return ['labs'];
    },
    labs(s, m) {
      s.labs = m.state;
      return ['labs'];
    },
  },
};
