// The installable app's part of the page, loaded just after it (pwa/index.ts): the service worker
// registered, a tapped push taking you to its agent (in this tab, told by the service worker, or a
// new one opened on /?agent=<id>), and a push taken down once its agent no longer waits on anyone.

import { pushHandled } from '../../shared/push';
import { store } from '../state';
import { pushName } from './index';
import { registration } from './sw';

/** What a shown push carries (public/sw.js). */
interface PushData {
  worker?: string;
  kind?: string;
}

const handled = (d: PushData | null) => !!d?.worker && pushHandled(d.kind, store.workers.get(d.worker), Date.now());

export function installApp(open: (workerId: string) => void) {
  void registration();
  if (!('serviceWorker' in navigator)) return;
  // Push on here, under keys the office no longer has: on again under its new ones.
  if ('Notification' in window && Notification.permission === 'granted') void import('./push').then((m) => m.refreshPush(pushName()));

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
      for (const n of shown) if (handled(n.data as PushData | null)) n.close();
    }, 1000);
  });
}
