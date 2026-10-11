import './pair.css';
// Settings > Account > Paired devices: the phones (and other browsers) paired with a "Pair a phone"
// code, with their names, when each was last seen and who paired it. Rename one, or revoke it: its
// sign-in stops at once and its open page is signed out. An admin sees everyone's. The button under
// the list opens Pair a phone (ui/pair.ts).

import { seenWords, type DeviceView } from '../../shared/devices';
import { h, toast } from './dom';
import { icon } from './icons';
import { setting } from './settings-frame';

async function post(path: string, body: unknown): Promise<string | undefined> {
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) return undefined;
    return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `The office answered ${res.status}`;
  } catch {
    return 'Server unreachable';
  }
}

const day = (at: number) => new Date(at).toLocaleDateString([], { day: 'numeric', month: 'short' });

/** The Paired devices setting. `pair` opens Pair a phone, calling back once a phone used the code. */
export function devicesSetting(pair: (paired: () => void) => void): HTMLElement {
  const list = h('ul.devices', { 'aria-label': 'Paired devices' });
  const note = h('p.setting-note', {}, 'Phones and other browsers you paired with a code. They stay signed in until revoked here.');

  const row = (d: DeviceView): HTMLElement => {
    const name = h('span.device-name', {}, d.name, d.current ? h('span.you', {}, 'this device') : null);
    const text = h('div.device-text', {}, name, h('span.device-when', {}, [`seen ${seenWords(d.lastSeen, Date.now())}`, `paired ${day(d.createdAt)} by ${d.by}`, d.owner && d.owner !== d.by ? `signs in as ${d.owner}` : ''].filter(Boolean).join(' · ')));
    const rename = h('button.btn.quiet', { type: 'button', 'aria-label': `Rename ${d.name}`, title: 'Rename' }, icon('edit', 14));
    const revoke = h('button.btn.danger', { type: 'button' }, 'Revoke');
    const li = h('li.device', {}, text, h('div.device-acts', {}, rename, revoke));
    rename.addEventListener('click', () => {
      const input = h('input', { type: 'text', value: d.name, maxlength: '40', 'aria-label': 'Device name' }) as HTMLInputElement;
      const save = async () => {
        const v = input.value.trim();
        if (v && v !== d.name) {
          const err = await post('/api/devices/rename', { id: d.id, name: v });
          if (err) toast(err, 'warn');
        }
        void refresh();
      };
      input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
      input.addEventListener('blur', () => void save());
      name.replaceWith(input);
      input.focus();
      input.select();
    });
    // Two taps: the first asks, the second revokes.
    let armed = false;
    revoke.addEventListener('click', async () => {
      if (!armed) {
        armed = true;
        revoke.textContent = d.current ? 'Sign this out?' : 'Sure? Revoke';
        setTimeout(() => {
          armed = false;
          revoke.textContent = 'Revoke';
        }, 4_000);
        return;
      }
      const err = await post('/api/devices/revoke', { id: d.id });
      if (err) return toast(err, 'warn');
      toast(`${d.name} is signed out`);
      if (d.current) return location.assign('/login');
      void refresh();
    });
    return li;
  };

  const refresh = async () => {
    try {
      const { devices } = (await (await fetch('/api/devices', { cache: 'no-store' })).json()) as { devices: DeviceView[] };
      list.replaceChildren(...devices.map(row));
      note.textContent = devices.length ? 'They stay signed in until revoked here.' : 'None yet. Pair a phone to answer your agents from it: it stays signed in until you revoke it here.';
    } catch {
      note.textContent = "Couldn't load the paired devices.";
    }
  };
  void refresh();

  const add = h('button.btn', { type: 'button', onclick: () => pair(() => void refresh()) }, icon('phone', 14), 'Pair a phone...');
  return setting('Paired devices', 'you', note, list, h('div.seg', { style: 'margin-top:8px' }, add));
}
