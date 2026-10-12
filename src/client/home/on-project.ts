// Going to an agent's project before doing something there: the pane, the row actions and the Deploy
// sheet all use it. Apart from deploy.ts so the Deploy sheet can load only when it's first opened
// (home/lazy.ts) while the rest keep it up front.
import type { Net } from '../net';
import { store } from '../state';

/** Runs `then` once you're on project `floor`: at once on yours, else after the office has moved you there. */
export function onProject(net: Net, floor: string, then: () => void) {
  if (!floor || floor === store.floor) return then();
  const off = store.on('floor', () => {
    if (store.floor !== floor) return;
    off();
    // A tick later, once the project's agents have arrived.
    setTimeout(then, 0);
  });
  net.send({ t: 'floor.go', floor });
}
