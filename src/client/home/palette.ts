// Ctrl+K: one box to reach any agent by its task or name, and every command the inbox has. Type to
// narrow it, Up and Down to move, Enter to go.

import { h, openModal } from '../ui/dom';
import { icon, type IconName } from '../ui/icons';
import { store } from '../state';
import { rankOf, entryTitle, whereLabel } from './list';
import { home } from './state';

export interface Command {
  label: string;
  hint?: string;
  icon?: IconName;
  run(): void;
}

export function openPalette(commands: () => Command[]) {
  const input = h('input', { type: 'text', placeholder: 'Find an agent or a command...', 'aria-label': 'Find an agent or a command', autocomplete: 'off', spellcheck: 'false' }) as HTMLInputElement;
  const list = h('ul.pal-list', { role: 'listbox', 'aria-label': 'Results' });
  const el = h('div.modal.palette', { role: 'dialog', 'aria-label': 'Commands' }, h('header', {}, icon('search', 16), input), list);
  const modal = openModal(el);
  let items: Command[] = [];
  let at = 0;

  const agents = (): Command[] =>
    store.roster.map((e) => {
      const r = rankOf(e.id);
      return {
        label: entryTitle(e),
        hint: `${e.name} · ${whereLabel(e)}`,
        icon: 'unit' as IconName,
        run: () => home.select(e.id, r?.att.level === 'review' ? 'changes' : 'terminal'),
      };
    });

  const paint = () => {
    const q = input.value.trim().toLowerCase();
    const all = [...commands(), ...agents()];
    items = q ? all.filter((c) => `${c.label} ${c.hint ?? ''}`.toLowerCase().includes(q)) : all;
    at = Math.min(at, Math.max(0, items.length - 1));
    list.replaceChildren(
      ...items.map((c, i) =>
        h(
          'li',
          { role: 'option', 'aria-selected': String(i === at), class: i === at ? 'on' : '', onmousedown: (ev: Event) => ev.preventDefault(), onclick: () => go(i) },
          c.icon ? icon(c.icon, 14) : null,
          h('span.pal-label', {}, c.label),
          c.hint ? h('small', {}, c.hint) : null,
        ),
      ),
      ...(items.length ? [] : [h('li.pal-none', {}, 'Nothing matches')]),
    );
    list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  };
  const go = (i: number) => {
    const c = items[i];
    if (!c) return;
    modal.close();
    c.run();
  };
  input.addEventListener('input', () => {
    at = 0;
    paint();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') at = Math.min(items.length - 1, at + 1);
    else if (e.key === 'ArrowUp') at = Math.max(0, at - 1);
    else if (e.key === 'Enter') return go(at);
    else return;
    e.preventDefault();
    paint();
  });
  paint();
  // At once, so what's typed straight after Ctrl+K lands in the box.
  input.focus();
}
