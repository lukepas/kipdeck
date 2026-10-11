// The one time Kipdeck asks whether this device may hear when an agent needs you: at your first
// Deploy, since you just handed an agent work it will come back to you about. Never again after
// that, whatever you answered; Settings > Notifications turns push on or off later.

import { storageKey } from '../shared/storage-key';
import { pushSupported } from './sw';

const ASKED = storageKey('push-asked');

/**
 * Call it from the click or key press that deployed: the browser's prompt shows right away, while
 * that still counts as one, and subscribing (push.ts) is loaded only once it's allowed.
 */
export function askOnceAtDeploy(name: string, told: (text: string, level?: 'info' | 'warn') => void) {
  try {
    if (localStorage.getItem(ASKED)) return;
    localStorage.setItem(ASKED, String(Date.now()));
  } catch {
    return;
  }
  if (!pushSupported() || Notification.permission === 'denied') return;
  const asking = Notification.permission === 'default';
  const allowed = asking ? Notification.requestPermission().catch(() => Notification.permission) : Promise.resolve(Notification.permission);
  void allowed.then(async (p) => {
    // They said no, or closed the prompt: nothing to tell them.
    if (p !== 'granted') return;
    const err = await (await import('./push')).enablePush(name);
    if (asking || err) told(err ?? 'Push is on: this device hears when an agent needs you. Settings > Notifications turns it off.', err ? 'warn' : 'info');
  });
}
