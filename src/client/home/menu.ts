// The avatar menu, top right: everything that isn't the inbox, in one short list. Work (the GitHub
// boards and the task queue), Mission control, catching up, notifications, light or dark, Labs, the
// keys, and signing out. A dropdown, not a window: a click outside or Esc puts it away.

import { h } from '../ui/dom';
import { icon, type IconName } from '../ui/icons';

export interface MenuItem {
  label: string;
  icon?: IconName;
  /** Small text on the right: a count, or what a toggle is set to. */
  note?: string;
  run(): void;
}

export type MenuEntry = MenuItem | { group: string } | null;

let open: { el: HTMLElement; close(): void } | null = null;

/** Whether the menu is down (Esc closes it before anything else hears it). */
export function menuOpen(): boolean {
  return !!open;
}

export function closeMenu() {
  open?.close();
}

/** Drops the menu under `anchor`, with `who` at its top. */
export function toggleMenu(anchor: HTMLElement, who: string, entries: MenuEntry[]) {
  if (open) return closeMenu();
  const items: HTMLButtonElement[] = [];
  const el = h(
    'div.menu-pop',
    { role: 'menu', 'aria-label': 'Menu' },
    h('div.menu-who', {}, who),
    ...entries.map((e) => {
      if (!e) return null;
      if ('group' in e) return h('div.menu-group', { role: 'presentation' }, e.group);
      const b = h(
        'button.menu-item',
        {
          type: 'button',
          role: 'menuitem',
          onclick: () => {
            closeMenu();
            e.run();
          },
        },
        e.icon ? icon(e.icon, 14) : h('span.menu-ico'),
        h('span', {}, e.label),
        e.note ? h('small', {}, e.note) : null,
      ) as HTMLButtonElement;
      items.push(b);
      return b;
    }),
  );
  const outside = (ev: MouseEvent) => {
    if (!el.contains(ev.target as Node) && !anchor.contains(ev.target as Node)) closeMenu();
  };
  const keys = (ev: KeyboardEvent) => {
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (ev.key === 'Escape') closeMenu();
    else if (ev.key === 'ArrowDown') items[(i + 1) % items.length]?.focus();
    else if (ev.key === 'ArrowUp') items[(i - 1 + items.length) % items.length]?.focus();
    else return;
    ev.preventDefault();
    ev.stopPropagation();
  };
  document.body.append(el);
  anchor.setAttribute('aria-expanded', 'true');
  document.addEventListener('mousedown', outside, true);
  window.addEventListener('keydown', keys, true);
  open = {
    el,
    close() {
      el.remove();
      anchor.setAttribute('aria-expanded', 'false');
      document.removeEventListener('mousedown', outside, true);
      window.removeEventListener('keydown', keys, true);
      open = null;
      anchor.focus();
    },
  };
  items[0]?.focus();
}
