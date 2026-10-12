// This browser and push: subscribing to the office's pushes and unsubscribing, and your devices.
// Loaded when first wanted (Settings, or the first Deploy through ask.ts), not with the page. Push
// needs https or localhost; on an iPhone or iPad, Kipdeck added to the Home Screen first.

import type { PushState } from '../../shared/protocol';
import { iosBrowser, pushSupported, registration } from './sw';

export type PushStatus =
  /** No service worker or push here: an old browser, or plain http on another computer. */
  | 'unsupported'
  /** iPhone or iPad Safari: push only works once Kipdeck is on the Home Screen. */
  | 'install'
  | 'denied'
  | 'off'
  | 'on';

async function subscription(): Promise<PushSubscription | null> {
  const r = await registration();
  return (await r?.pushManager.getSubscription().catch(() => null)) ?? null;
}

export async function pushStatus(): Promise<PushStatus> {
  if (!pushSupported()) return iosBrowser() && window.isSecureContext ? 'install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.permission === 'granted' && (await subscription()) ? 'on' : 'off';
}

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

/** The office's key and your devices; undefined when the office can't be asked. */
export async function pushState(name: string): Promise<PushState | undefined> {
  try {
    const res = await fetch(`/api/push?name=${encodeURIComponent(name)}`, { cache: 'no-store' });
    return res.ok ? ((await res.json()) as PushState) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Turns push on for this browser: the permission prompt (call it from a click or key press), then
 * a subscription the office keeps. Resolves to why it didn't, or undefined once it's on.
 */
export async function enablePush(name: string): Promise<string | undefined> {
  if (!pushSupported()) return iosBrowser() ? 'On an iPhone or iPad, add Kipdeck to the Home Screen first (Share, then Add to Home Screen), and turn push on from there.' : 'This browser cannot take pushes from this page. Push needs https or localhost.';
  const perm = Notification.permission === 'default' ? await Notification.requestPermission().catch(() => Notification.permission) : Notification.permission;
  if (perm !== 'granted') return 'Notifications are blocked for this page. Allow them in the site settings, then try again.';
  const r = await registration();
  const state = await pushState(name);
  if (!r || !state) return 'Could not reach Kipdeck to turn push on';
  try {
    let sub = await r.pushManager.getSubscription();
    // Subscribed with another office's key (the office's keys were made again): start over.
    const key = sub?.options.applicationServerKey;
    if (sub && key && b64u(key) !== state.key) {
      await sub.unsubscribe();
      sub = null;
    }
    sub ??= await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(state.key) });
    const res = await post('/api/push/subscribe', { subscription: sub.toJSON(), name });
    if (!res.ok) return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Kipdeck said no (${res.status})`;
    return undefined;
  } catch (err) {
    return `The browser would not subscribe: ${(err as Error).message}`;
  }
}

/**
 * Push was on here, but the office made new keys since (its vapid.json was deleted or lost), which
 * also forgot every device: subscribes again with the new key, so this browser doesn't sit there
 * showing On while nothing can reach it. Run when the page loads.
 */
export async function refreshPush(name: string): Promise<void> {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const key = (await subscription())?.options.applicationServerKey;
  if (!key) return;
  const state = await pushState(name);
  if (state && b64u(key) !== state.key) await enablePush(name);
}

/** Turns push off for this browser. */
export async function disablePush(name: string): Promise<void> {
  const sub = await subscription();
  if (!sub) return;
  await post('/api/push/unsubscribe', { endpoint: sub.endpoint, name }).catch(() => undefined);
  await sub.unsubscribe().catch(() => false);
}

/** Forgets one of your devices (another browser, a lost phone). */
export async function removeDevice(id: string, name: string): Promise<void> {
  await post('/api/push/unsubscribe', { id, name }).catch(() => undefined);
}

/** A push to every device of yours: how many took it. */
export async function testPush(name: string): Promise<number> {
  try {
    const res = await post('/api/push/test', { name });
    return res.ok ? ((await res.json()) as { sent: number }).sent : 0;
  } catch {
    return 0;
  }
}

function fromB64u(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64u(buf: ArrayBuffer | ArrayBufferView): string {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
