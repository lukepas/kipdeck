// Kipdeck's service worker: shows the office's pushes (server/push/alerts.ts) when no Kipdeck tab is
// in front of you, and takes you to the agent when you tap one. The buttons that are safe without
// looking (Snooze 1h, Mark seen) are done from here, and so are Allow once and Deny on an approval
// push with no risk tags (server/push/approve.ts); Answer, Review and Look open the inbox on that
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
    data: { url: p.url || '/', worker: p.worker, kind: p.kind, ...(p.approve ? { approve: p.approve, title: p.title } : {}) },
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

/**
 * Allow once or Deny, from the button, as the device that took the push, with the one-use token it
 * carried. Refused (answered elsewhere, moved on, expired), the notification comes back saying why,
 * and a tap on it opens the agent.
 */
async function answer(decision, data) {
  const sub = await self.registration.pushManager.getSubscription();
  let why = 'Could not reach Kipdeck.';
  if (sub) {
    try {
      const res = await fetch('/api/push/answer', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint, token: data.approve, decision }),
      });
      if (res.ok) return;
      const b = await res.json().catch(() => ({}));
      if (b && typeof b.error === 'string') why = b.error;
    } catch {
      // why stays as it is
    }
  }
  await self.registration.showNotification(data.title || 'Kipdeck', {
    body: `${why}\nTap to open it in Kipdeck.`,
    tag: data.worker ? `worker-${data.worker}` : 'kipdeck-approval',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/', worker: data.worker, kind: data.kind },
  });
}

/**
 * Is this tab the inbox? It sits on / and, once an agent or a project is open in it, on
 * /a/<project>/<agent> or /p/<project> (history.pushState in client/home/route.ts). The same paths
 * as parseHomePath in src/shared/deeplink.ts, written out here because this file is plain JS.
 */
function isInbox(pathname) {
  return pathname === '/' || pathname === '/index.html' || pathname.startsWith('/a/') || pathname.startsWith('/p/');
}

/** The agent an inbox tab on /a/<project>/<agent> has open, if any. */
function agentOf(pathname) {
  const parts = pathname.split('/');
  if (parts[1] !== 'a') return '';
  try {
    return decodeURIComponent(parts[3] || '');
  } catch {
    return '';
  }
}

/**
 * To the agent: an inbox tab already open is brought up and told which (one already on that agent
 * first), else one opens on it. Only the inbox knows the message; a Deck or login tab left open
 * would just come up and do nothing.
 */
async function open(data) {
  const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const inboxes = wins.filter((c) => isInbox(new URL(c.url).pathname));
  const home = (data.worker && inboxes.find((c) => agentOf(new URL(c.url).pathname) === data.worker)) || inboxes[0];
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
  if ((e.action === 'allow' || e.action === 'deny') && data.approve) return e.waitUntil(answer(e.action === 'allow' ? 'once' : 'deny', data));
  e.waitUntil(open(data));
});
