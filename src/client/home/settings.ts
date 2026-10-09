// The home page's Settings: three panes and nothing of the 3D bridge. Account (who you are, light or
// dark, teammates for admins, anonymous usage numbers), Agents and Notifications, from the panes every
// page shares (ui/settings-core.ts). Loaded the first time Settings is opened (home/lazy.ts).
import type { Net } from '../net';
import type { DesktopNotifier } from '../notify';
import { saveLighting, savedLighting, markPageLight } from '../lighting';
import { saveSettings, store, type Lighting, type Settings } from '../state';
import { h } from '../ui/dom';
import { corePanes, type CorePane } from '../ui/settings-core';
import { openSettingsFrame, setting } from '../ui/settings-frame';
import * as lazy from './lazy';
import { setupState, usageSwitch } from './setup';

const LOOKS: [Lighting, string][] = [
  ['day', 'Light'],
  ['night', 'Dark'],
  ['auto', 'Match the system'],
];

let lastPane: CorePane = 'account';

/** Light, dark or the system's, kept in this browser. */
function appearance(): HTMLElement {
  const row = h('div.seg', { role: 'radiogroup', 'aria-label': 'Appearance' });
  const paint = () => {
    const now = savedLighting();
    row.replaceChildren(
      ...LOOKS.map(([value, label]) =>
        h('button.btn', { type: 'button', role: 'radio', 'aria-checked': String(now === value), class: now === value ? 'on' : '', onclick: () => (saveLighting(value), markPageLight(value), paint()) }, label),
      ),
    );
  };
  paint();
  return row;
}

/** Labs, at the foot of Account: the parts beyond the inbox, each on until an admin switches it off. */
function labs(net: Net): HTMLElement {
  return setting(
    'Labs',
    'office',
    h('p.setting-note', {}, 'The 3D Deck, GitHub boards and the task queue, goals, meetings, voice and Proof of Merge. Each is on until an admin switches it off.'),
    h('div.seg', { style: 'margin-top:8px' }, h('button.btn', { type: 'button', onclick: () => void lazy.labs().then((m) => m.openLabs(net)) }, 'Open Labs...')),
  );
}

export interface HomeSettingsDeps {
  net: Net;
  settings: Settings;
  notifier: DesktopNotifier;
}

/** Opens Settings on `first`, or where it was last. */
export function openHomeSettings(d: HomeSettingsDeps, first?: CorePane) {
  const { net, settings } = d;
  const admin = store.me.admin;
  const team = admin
    ? setting(
        'Teammates',
        'office',
        h('p.setting-note', {}, 'Give each teammate an account of their own with a single-use invite link: their name goes on what they answer, review and merge.'),
        h('div.seg', { style: 'margin-top:8px' }, h('button.btn', { type: 'button', onclick: () => void lazy.accounts().then((m) => m.openAccounts(net)) }, 'Invite and manage...')),
      )
    : null;
  const s = setupState();
  const usage = admin && s?.telemetry.allowed ? setting('Usage numbers', 'office', usageSwitch(net, s)) : null;
  const core = corePanes({
    net,
    settings: () => settings,
    change: (some) => {
      Object.assign(settings, some);
      saveSettings(settings);
    },
    sample: () => d.notifier.sample(),
    signOut: () => void fetch('/api/logout', { method: 'POST' }).finally(() => location.assign('/login')),
    extra: { account: [setting('Appearance', 'you', appearance()), ...(team ? [team] : []), ...(usage ? [usage] : []), labs(net)] },
  });
  openSettingsFrame(core.panes, first ?? lastPane, { onPick: (id) => (lastPane = id), onClose: core.off });
}
