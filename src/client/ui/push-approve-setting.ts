// Settings > Notifications > Allow or deny from a notification: whether an approval push to your own
// devices, for a request with no risk tags, carries Allow once and Deny. On until you turn it off.
// The server side is server/push/approve.ts; why it is safe enough is docs/security.md.

import { pushName } from '../pwa';
import { h } from './dom';
import { setting } from './settings-frame';

async function read(name: string): Promise<boolean | undefined> {
  try {
    const res = await fetch(`/api/push/approve?name=${encodeURIComponent(name)}`, { cache: 'no-store' });
    return res.ok ? ((await res.json()) as { on: boolean }).on : undefined;
  } catch {
    return undefined;
  }
}

async function write(name: string, on: boolean): Promise<boolean | undefined> {
  try {
    const res = await fetch('/api/push/approve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on, name }) });
    return res.ok ? ((await res.json()) as { on: boolean }).on : undefined;
  } catch {
    return undefined;
  }
}

export function pushApproveSetting(): HTMLElement {
  const row = h('div.seg');
  const note = h(
    'p.setting-note',
    {},
    'When an agent you deployed asks to run something with no risk tags (nothing destructive, no network, nothing outside its project, no secrets), the push to your devices has Allow once and Deny. Anything with a risk tag opens Kipdeck instead. A button works once, for that request only, for 10 minutes.',
  );
  const paint = (on: boolean | undefined) => {
    row.replaceChildren(
      ...([
        [true, 'On'],
        [false, 'Off'],
      ] as const).map(([value, label]) =>
        h('button.btn', {
          type: 'button',
          role: 'radio',
          'aria-checked': String(on === value),
          class: on === value ? 'on' : '',
          disabled: on === undefined,
          onclick: async () => {
            if (on === value) return;
            const now = await write(pushName(), value);
            if (now === undefined) unreachable();
            paint(now ?? on);
          },
        }, label),
      ),
    );
  };
  const unreachable = () => {
    note.classList.add('bad');
    note.textContent = 'Could not reach Kipdeck to change this. Open Settings again to retry.';
  };
  paint(undefined);
  void read(pushName()).then((on) => {
    if (on === undefined) unreachable();
    paint(on);
  });
  return setting('Allow or deny from a notification', 'you', row, note);
}
