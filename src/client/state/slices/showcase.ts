import type { ShowcaseSettingsState } from '../../../shared/protocol';
import type { Slice } from '../store';

declare module '../store' {
  interface Store {
    /** The public showcase's settings, once Settings asked for them (admins only; see protocol/showcase.ts). */
    showcaseSettings?: ShowcaseSettingsState;
  }
  interface Topics {
    showcaseSettings: true;
  }
}

/** The public showcase's settings (/pom/). */
export const showcase: Slice = {
  init(s) {
    s.showcaseSettings = undefined;
  },
  on: {
    'showcase.settings'(s, m) {
      s.showcaseSettings = m.state;
      return ['showcaseSettings'];
    },
  },
};
