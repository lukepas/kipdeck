// The phone path on the inbox: the address that follows what's open (route.ts), Pair a phone in the
// avatar menu and the commands, "Copy link to this agent", and a paired device's sign-in rolled
// forward each time it opens the inbox (GET /api/device), so a phone in use never signs out.
// The read-only demo shows none of it: a visitor there can't pair anything.

import './phone.css';
import * as lazy from './lazy';
import type { MenuEntry } from './menu';
import type { Command } from './palette';
import { home } from './state';

/** Opens Pair a phone; `paired` hears when a phone used its code. */
export const openPair = (paired?: () => void) => void lazy.pair().then((m) => m.openPair({ paired }));

export const phoneMenuEntry = (): MenuEntry => (home.readOnly ? null : { label: 'Pair a phone', icon: 'phone', run: () => openPair() });

export const phoneCommands = (): Command[] => [
  ...(home.readOnly ? [] : [{ label: 'Pair a phone', hint: 'Answer your agents from your phone', icon: 'phone' as const, run: () => openPair() }]),
  ...(home.selected ? [{ label: 'Copy link to this agent', hint: 'Opens it on any signed-in device', icon: 'link' as const, run: () => void lazy.pair().then((m) => m.copyAgentLink(home.selected)) }] : []),
];

export function installPhone() {
  // Its own chunk, a moment after the first paint: an address it follows waits for the agents anyway.
  void import('./route').then((m) => m.installRoutes());
  void fetch('/api/device', { cache: 'no-store' }).catch(() => {});
}
