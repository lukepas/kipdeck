// The service worker (src/client/public/sw.js), run as it is in a stand-in for the browser's worker
// scope: a push shows the notification the office sent (task as title, two buttons at most, sticky
// for questions), a tap brings up the inbox tab (on /, /a/... or /p/...) on that agent or opens one (never a Deck tab, which
// doesn't know the message), and Snooze goes back to the office as the device that took the push.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { pushPayload } from '../src/shared/push.js';

/** Out of the worker's own realm, to compare. */
const plain = (v: unknown) => JSON.parse(JSON.stringify(v));
const SW = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'client', 'public', 'sw.js'), 'utf8');

interface Win {
  url: string;
  focused: boolean;
  told: unknown[];
  focus(): Promise<void>;
  postMessage(m: unknown): void;
}

function scope(windows: string[] = []) {
  const listeners = new Map<string, (e: unknown) => void>();
  const shown: { title: string; options: Record<string, any> }[] = [];
  const opened: string[] = [];
  const fetched: { url: string; body: unknown }[] = [];
  const wins: Win[] = windows.map((url) => ({
    url,
    focused: false,
    told: [],
    async focus() {
      this.focused = true;
    },
    postMessage(m: unknown) {
      this.told.push(m);
    },
  }));
  const self = {
    addEventListener: (t: string, fn: (e: unknown) => void) => listeners.set(t, fn),
    skipWaiting: () => undefined,
    clients: { claim: async () => undefined, matchAll: async () => wins, openWindow: async (u: string) => void opened.push(u) },
    registration: {
      getNotifications: async () => [],
      showNotification: async (title: string, options: Record<string, any>) => void shown.push({ title, options }),
      pushManager: { getSubscription: async () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/me' }) },
    },
  };
  const fetch = async (url: string, init: { body: string }) => (fetched.push({ url, body: JSON.parse(init.body) }), { ok: true });
  vm.runInNewContext(SW, { self, fetch, URL, JSON, Array, Promise });
  /** Fires an event and waits for what it asked to wait for. */
  const fire = async (type: string, e: Record<string, unknown>) => {
    let waited: Promise<unknown> = Promise.resolve();
    listeners.get(type)!({ ...e, waitUntil: (p: Promise<unknown>) => (waited = p) });
    await waited;
  };
  return { fire, shown, opened, fetched, wins };
}

test('a push shows the office\'s notification as it was sent', async () => {
  const s = scope();
  const p = pushPayload({ kind: 'question', worker: 'w1', task: 'Fix flaky checkout test', project: 'shop', detail: 'Which selector?' });
  await s.fire('push', { data: { json: () => p } });
  assert.equal(s.shown.length, 1);
  assert.equal(s.shown[0].title, 'Fix flaky checkout test');
  assert.equal(s.shown[0].options.body, 'Needs an answer in shop\nWhich selector?');
  assert.equal(s.shown[0].options.tag, 'worker-w1');
  assert.equal(s.shown[0].options.requireInteraction, true);
  assert.deepEqual(s.shown[0].options.actions.map((a: { action: string }) => a.action), ['open', 'snooze']);
  assert.deepEqual(plain(s.shown[0].options.data), { url: '/?agent=w1', worker: 'w1', kind: 'question' });
});

test('a push it cannot read still says an agent needs you', async () => {
  const s = scope();
  await s.fire('push', { data: { json: () => JSON.parse('not json') } });
  assert.equal(s.shown[0].title, 'Kipdeck');
  assert.equal(s.shown[0].options.body, 'An agent needs you');
});

const notification = (data: Record<string, unknown>) => ({ data, closed: false, close() {
  this.closed = true;
} });

test('a tap brings up the inbox tab on that agent, and opens one when only the Deck is open', async () => {
  const both = scope(['https://office.example/deck', 'https://office.example/?x=1']);
  const n = notification({ url: '/?agent=w1', worker: 'w1', kind: 'question' });
  await both.fire('notificationclick', { notification: n, action: '' });
  assert.ok(n.closed);
  assert.equal(both.wins[1].focused, true);
  assert.deepEqual(plain(both.wins[1].told), [{ t: 'kipdeck.open', worker: 'w1' }]);
  assert.deepEqual(both.wins[0].told, [], 'the Deck is left alone');
  assert.deepEqual(both.opened, []);

  const deck = scope(['https://office.example/deck']);
  await deck.fire('notificationclick', { notification: notification({ url: '/?agent=w1', worker: 'w1' }), action: 'open' });
  assert.deepEqual(deck.opened, ['/?agent=w1']);
  assert.deepEqual(deck.wins[0].told, []);
});

test('a tap reuses an inbox tab that has an agent or a project open, rather than opening a second inbox', async () => {
  // client/home/route.ts moves an open inbox to /a/<project>/<agent> or /p/<project>.
  for (const at of ['https://office.example/a/proj/w1', 'https://office.example/p/proj', 'https://office.example/index.html']) {
    const s = scope(['https://office.example/deck', at]);
    await s.fire('notificationclick', { notification: notification({ url: '/?agent=w2', worker: 'w2', kind: 'question' }), action: '' });
    assert.equal(s.wins[1].focused, true, at);
    assert.deepEqual(plain(s.wins[1].told), [{ t: 'kipdeck.open', worker: 'w2' }], at);
    assert.deepEqual(s.wins[0].told, [], 'the Deck is left alone');
    assert.deepEqual(s.opened, [], at);
  }
});

test('a tap prefers the inbox tab already on that agent', async () => {
  const s = scope(['https://office.example/a/proj/w1', 'https://office.example/a/proj/w2']);
  await s.fire('notificationclick', { notification: notification({ url: '/?agent=w2', worker: 'w2' }), action: 'open' });
  assert.equal(s.wins[0].focused, false);
  assert.equal(s.wins[1].focused, true);
  assert.deepEqual(plain(s.wins[1].told), [{ t: 'kipdeck.open', worker: 'w2' }]);
  assert.deepEqual(s.opened, []);
});

test('a tap still opens an inbox when only the Deck or sign-in is open', async () => {
  const s = scope(['https://office.example/deck', 'https://office.example/login?next=%2Fa%2Fproj%2Fw1']);
  await s.fire('notificationclick', { notification: notification({ url: '/?agent=w1', worker: 'w1' }), action: 'open' });
  assert.deepEqual(s.opened, ['/?agent=w1']);
  assert.deepEqual(s.wins[0].told, []);
  assert.deepEqual(s.wins[1].told, []);
});

test('Snooze and Mark seen go back to the office as this device, without opening anything', async () => {
  const s = scope();
  await s.fire('notificationclick', { notification: notification({ worker: 'w1', kind: 'question' }), action: 'snooze' });
  await s.fire('notificationclick', { notification: notification({ worker: 'w2', kind: 'review' }), action: 'seen' });
  assert.deepEqual(s.fetched, [
    { url: '/api/push/act', body: { endpoint: 'https://fcm.googleapis.com/fcm/send/me', worker: 'w1', action: 'snooze' } },
    { url: '/api/push/act', body: { endpoint: 'https://fcm.googleapis.com/fcm/send/me', worker: 'w2', action: 'seen' } },
  ]);
  assert.deepEqual(s.opened, []);
});
