// The installable app's part of the page, loaded just after it (pwa/index.ts): the service worker
// registered, a tapped push taking you to its agent (in this tab, told by the service worker, or a
// new one opened on /?agent=<id>), and a push taken down once its agent no longer waits on anyone.

import { store } from '../state';
import { waitingOnSomeone } from '../notify';
import { registration } from './sw';

export function installApp(open: (workerId: string) => void) {
  void registration();
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('message', (e: MessageEvent<{ t?: string; worker?: unknown }>) => {
    if (e.data?.t === 'kipdeck.open' && typeof e.data.worker === 'string') open(e.data.worker);
  });

  // Opened from a push with no Kipdeck tab: once the agent is known, go to it and tidy the address.
  const wanted = new URLSearchParams(location.search).get('agent');
  if (wanted) {
    const go = () => {
      if (!store.roster.some((r) => r.id === wanted) && !store.workers.has(wanted)) return;
      offRoster();
      offWorkers();
      const q = new URLSearchParams(location.search);
      q.delete('agent');
      history.replaceState(null, '', `${location.pathname}${q.size ? `?${q}` : ''}${location.hash}`);
      open(wanted);
    };
    const offRoster = store.on('roster', go);
    const offWorkers = store.on('workers', go);
    // They may be here already.
    go();
  }

  // A push about an agent somebody already got to comes down, on this device.
  let tidy: number | undefined;
  store.on('workers', () => {
    clearTimeout(tidy);
    tidy = window.setTimeout(async () => {
      const r = await registration();
      const shown = (await r?.getNotifications().catch(() => [])) ?? [];
      for (const n of shown) {
        const id = (n.data as { worker?: string } | null)?.worker;
        const w = id ? store.workers.get(id) : undefined;
        if (w && !waitingOnSomeone(w)) n.close();
      }
    }, 1000);
  });
}
