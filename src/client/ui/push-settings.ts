// Settings > Notifications > Push to your devices: this browser's push on or off, a test push, and
// the other devices of yours that take them (another browser, your phone), each with Remove. What
// push does and when is pwa/push.ts and server/push/alerts.ts.

import './push-settings.css';
import { pushName } from '../pwa';
import { disablePush, enablePush, pushState, pushStatus, removeDevice, testPush } from '../pwa/push';
import { h, timeAgo } from './dom';
import { setting } from './settings-frame';

export function pushSetting(): HTMLElement {
  const row = h('div.seg');
  const note = h('p.setting-note');
  const devices = h('ul.push-devices');

  const paint = async () => {
    const [status, state] = await Promise.all([pushStatus(), pushState(pushName())]);
    row.replaceChildren();
    if (status === 'off' || status === 'on') {
      for (const [value, label] of [
        [true, 'On'],
        [false, 'Off'],
      ] as const) {
        const on = status === 'on';
        row.append(
          h('button.btn', {
            type: 'button',
            role: 'radio',
            'aria-checked': String(on === value),
            class: on === value ? 'on' : '',
            onclick: async () => {
              if (on === value) return;
              note.classList.remove('bad');
              const err = value ? await enablePush(pushName()) : (await disablePush(pushName()), undefined);
              await paint();
              if (err) {
                note.textContent = err;
                note.classList.add('bad');
              }
            },
          }, label),
        );
      }
      if (status === 'on')
        row.append(
          h('button.btn', {
            type: 'button',
            onclick: async () => {
              const n = await testPush(pushName());
              note.textContent = n ? `Sent a test push to ${n} device${n === 1 ? '' : 's'}.` : 'No device took the test push. Turn push off and on again here.';
            },
          }, 'Send a test'),
        );
    }
    note.textContent =
      status === 'unsupported'
        ? 'This browser cannot take pushes from this page. Push needs https or localhost (an SSH tunnel counts).'
        : status === 'install'
          ? 'On an iPhone or iPad, add Kipdeck to the Home Screen (Share, then Add to Home Screen), open it from there and turn push on.'
          : status === 'denied'
            ? 'Your browser blocks notifications from this page. Allow them in the site settings, then open this again.'
            : 'When an agent needs an answer or an approval, has work to review or gets stuck, and you are not at a Kipdeck tab, this device gets a push with the task as its title. Unanswered a few minutes later, the team channel below hears too.';
    const others = state?.devices ?? [];
    devices.replaceChildren(
      ...others.map((d) =>
        h(
          'li',
          {},
          h('span', {}, `${d.label}, added ${timeAgo(d.at)}${d.lastAt ? `, last push ${timeAgo(d.lastAt)}` : ''}`),
          h('button.btn.small', { type: 'button', onclick: async () => (await removeDevice(d.id, pushName()), void paint()) }, 'Remove'),
        ),
      ),
    );
    devices.classList.toggle('hidden', !others.length);
  };
  void paint();
  return setting('Push to your devices', 'you', row, note, devices);
}
