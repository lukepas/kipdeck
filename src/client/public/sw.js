// Kipdeck's service worker: shows the office's pushes (server/push/alerts.ts) when no Kipdeck tab is
// in front of you, and takes you to the agent when you tap one. The buttons that are safe without
// looking (Snooze 1h, Mark seen) are done from here; Answer, Review and Look open the inbox on that
// agent. No caching and no offline mode: the inbox is only any use connected to the office.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let p;
  try {
    p = e.data ? e.data.json() : null;
  } catch {
    p = null;
  }
  if (!p || typeof p.title !== 'string') p = { title: 'Kipdeck', body: 'An agent needs you', tag: 'kipdeck', url: '/', actions: [], sticky: false };
  e.waitUntil(show(p));
});

async function show(p) {
  // An earlier push about the same agent still up: this one buzzes again. The page's own notification
  // with the same tag (notify.ts) is replaced quietly instead, so one wait never buzzes twice.
  const prior = await self.registration.getNotifications({ tag: p.tag }).catch(() => []);
  await self.registration.showNotification(p.title, {
    body: p.body,
    tag: p.tag,
    renotify: prior.length > 0,
    requireInteraction: !!p.sticky,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    actions: Array.isArray(p.actions) ? p.actions.slice(0, 2) : [],
    data: { url: p.url || '/', worker: p.worker, kind: p.kind },
  });
}

/** Snooze or Mark seen, from the button, as the device that took the push. */
async function act(action, worker) {
  const sub = await self.registration.pushManager.getSubscription();
  if (!sub) return;
  await fetch('/api/push/act', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint, worker, action }),
  }).catch(() => {});
}

/** To the agent: a Kipdeck tab already open is brought up and told which, else one opens on it. */
async function open(data) {
  const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const home = wins.find((c) => new URL(c.url).pathname === '/') || wins[0];
  if (home) {
    await home.focus().catch(() => {});
    home.postMessage({ t: 'kipdeck.open', worker: data.worker });
    return;
  }
  await self.clients.openWindow(data.url || '/');
}

self.addEventListener('notificationclick', (e) => {
  const n = e.notification;
  const data = n.data || {};
  n.close();
  if ((e.action === 'snooze' || e.action === 'seen') && data.worker) return e.waitUntil(act(e.action, data.worker));
  e.waitUntil(open(data));
});
