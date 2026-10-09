import './settings.css';
// The Settings window's frame, shared by the home page and the Deck: the categories down the
// side (a row across the top on a phone), the picked one on the right, a card per setting, and a ✕
// that closes it like Esc. Each page hands it its own panes; the three every page has (Account,
// Agents, Notifications) come from settings-core.ts.
import { h, openModal } from './dom';
import { icon, type IconName } from './icons';

/** Who a setting is for, shown by its name: some are yours alone, some the whole office's. */
export type Scope = 'you' | 'floor' | 'office';
const SCOPE: Record<Scope, [label: string, title: string]> = {
  you: ['Just you', 'Only for you, kept in this browser'],
  floor: ['This project', 'The same for everyone on this project'],
  office: ['Everyone', 'The same for everyone using this Kipdeck'],
};

/** One setting: its name and who it's for, then whatever sets it. */
export const setting = (title: string, scope: Scope | null, ...body: (Node | null)[]) =>
  h('div.setting', {}, h('div.setting-head', {}, h('h4', {}, title), scope && h('span.scope', { class: scope, title: SCOPE[scope][1] }, SCOPE[scope][0])), ...body);

export interface SettingsPaneDef<Id extends string> {
  id: Id;
  icon: IconName;
  label: string;
  blurb: string;
  body: Node[];
}

/** Opens Settings on `first` with `panes` down the side. `onPick` hears which pane is shown; `onClose` runs once it's gone. */
export function openSettingsFrame<Id extends string>(panes: SettingsPaneDef<Id>[], first: Id, opts: { onPick?: (id: Id) => void; onClose?: () => void } = {}) {
  const nav = h('nav.settings-nav', { role: 'tablist', 'aria-orientation': 'vertical', 'aria-label': 'Settings' });
  const tabs = new Map<Id, HTMLButtonElement>();
  const bodies = new Map<Id, HTMLElement>();
  let current = first;
  for (const p of panes) {
    const tab = h('button.settings-tab', { type: 'button', role: 'tab', onclick: () => show(p.id) }, h('span.icon', { 'aria-hidden': 'true' }, icon(p.icon, 16)), h('span', {}, p.label)) as HTMLButtonElement;
    tabs.set(p.id, tab);
    nav.append(tab);
    bodies.set(p.id, h('section.settings-pane', { role: 'tabpanel', 'aria-label': p.label }, h('div.settings-head', {}, h('h3', {}, p.label), h('p', {}, p.blurb)), ...p.body));
  }
  const show = (id: Id) => {
    current = id;
    opts.onPick?.(id);
    for (const [t, tab] of tabs) {
      tab.classList.toggle('on', t === id);
      tab.setAttribute('aria-selected', String(t === id));
      tab.tabIndex = t === id ? 0 : -1;
    }
    for (const [t, body] of bodies) body.classList.toggle('hidden', t !== id);
    bodies.get(id)!.scrollTop = 0;
    // On a phone the categories are a row across the top that scrolls sideways.
    tabs.get(id)!.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  nav.addEventListener('keydown', (e) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = panes.findIndex((p) => p.id === current);
    const next = panes[(i + step + panes.length) % panes.length].id;
    show(next);
    tabs.get(next)!.focus();
  });

  const close = h('button.btn.close', { type: 'button', 'aria-label': 'Close', title: 'Close (Esc)' }, icon('close', 16));
  const el = h('div.modal.settings', { role: 'dialog', 'aria-label': 'Settings' }, h('header', {}, h('h2', {}, 'Settings'), close), h('div.settings-body', {}, nav, ...bodies.values()));
  const modal = openModal(el, { doing: 'in settings', onClose: () => opts.onClose?.() });
  show(tabs.has(first) ? first : panes[0].id);
  close.addEventListener('click', () => modal.close());
  return modal;
}
