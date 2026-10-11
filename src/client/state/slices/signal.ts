import type { SignalGist } from '../../../shared/protocol';
import type { Slice } from '../store';

declare module '../store' {
  interface Store {
    /** Signal's gist of each floor the page asked about (see protocol/signal.ts), by floor id, and when it came. */
    signals: Map<string, { gist: SignalGist; at: number }>;
  }
  interface Topics {
    signal: true;
  }
}

/** Signal: what the office said about each floor's Goals milestone and last /rundown. */
export const signal: Slice = {
  init(s) {
    s.signals = new Map();
  },
  on: {
    'signal.gist'(s, m) {
      s.signals.set(m.gist.floor, { gist: m.gist, at: Date.now() });
      return ['signal'];
    },
  },
};
