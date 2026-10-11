// Kipdeck as an installable app that reaches you away from the tab: the service worker registered,
// your presence told to the office, a tapped push taking you to its agent (in this tab, told by the
// service worker, or a new one opened on /?agent=<id>), and a push taken down once its agent no
// longer waits on anyone. Turning push on is pwa/push.ts.

import type { Net } from '../net';
import { store } from '../state';
import { trackPresence } from './presence';

/** The name your devices are kept under on the shared password; your account's, with one. */
export const pushName = () => store.me.account?.name ?? store.profile.name;

export function installPwa(net: Net, open: (workerId: string) => void) {
  trackPresence(net);
  // The rest waits for the page to be up: none of it is needed to draw (tests/home-budget.test.ts).
  void import('./app').then((m) => m.installApp(open));
}
