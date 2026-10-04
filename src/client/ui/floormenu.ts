import './floormenu.css';
import { attentionCounts, LEVEL_LABEL, rankRoster } from '../../shared/attention';
import { shortPath } from '../../shared/rowtext';
import { cloneLabel } from '../../shared/floors';
import type { FloorInfo } from '../../shared/protocol';
import { store } from '../state';
import { h } from './dom';
import { icon, LEVEL_ICON } from './icons';

// The floor list that drops down from the project in the corner: every floor of the building, top
// floor first. Picking one takes you straight there, to the same spot in the office you're standing
// in now. Adding a project is the Floors window's job.

export interface FloorMenuOptions {
  /** Go to that floor, staying where you are in the office. */
  go(floorId: string): void;
  /** Open the Floors window, to add a project. */
  floors(): void;
}

let current: { el: HTMLElement; close(): void } | null = null;

export function floorMenuOpen(): boolean {
  return !!current;
}

export function closeFloorMenu() {
  current?.close();
}

/** Opens the floor list under `anchor`, or closes it if it's open. */
export function toggleFloorMenu(anchor: HTMLElement, opts: FloorMenuOptions): void {
  if (current) return current.close();
  const el = h('div.floor-menu.panel', { role: 'menu', 'aria-label': 'Decks' });

  const item = (f: FloorInfo, i: number, here: number) => {
    const isHere = f.id === store.floor;
    const n = Math.abs(i - here);
    const where = isHere ? 'you are here' : here < 0 ? '' : `${n} deck${n === 1 ? '' : 's'} ${i > here ? 'up' : 'down'}`;
    // Its units by state, as the top bar counts them: glyph and number, the zeros left out.
    const c = attentionCounts(rankRoster(store.roster.filter((e) => e.floor === f.id), Date.now()));
    const stats: HTMLElement[] = f.cloning
      ? [h('span', { title: f.clone?.detail ?? 'Being cloned' }, cloneLabel(f.clone))]
      : (['needs-you', 'stuck', 'review', 'working'] as const).filter((l) => c[l]).map((l) => h('span.deck-chip', { class: l, title: `${LEVEL_LABEL[l]}: ${c[l]}` }, icon(LEVEL_ICON[l], 12), String(c[l])));
    const btn = h(
      'button.floor-item',
      { type: 'button', role: 'menuitem', class: isHere ? 'here' : '', disabled: isHere || f.cloning, title: isHere ? "You're on this deck" : f.cloning ? 'Still being cloned' : `Go to ${f.name}, right where you're standing` },
      h('span.floor-no', {}, String(i + 1)),
      h('span.floor-text', {}, h('span.floor-name', {}, f.name), h('span.floor-sub', { title: f.dir }, where || (f.repo ?? shortPath(f.dir)))),
      h('span.floor-stats', {}, ...stats),
    );
    btn.addEventListener('click', () => {
      if (isHere || f.cloning) return;
      close();
      opts.go(f.id);
    });
    return btn;
  };

  const render = () => {
    const floors = store.floors;
    const here = floors.findIndex((f) => f.id === store.floor);
    const add = h('button.floor-item.add', { type: 'button', role: 'menuitem', title: 'The Decks window: add another project as a deck' }, h('span.floor-no', {}, icon('plus', 14)), h('span.floor-text', {}, h('span.floor-name', {}, 'Decks'), h('span.floor-sub', {}, 'Add a deck from a repo')));
    add.addEventListener('click', () => {
      close();
      opts.floors();
    });
    // Top floor first, the way a building's directory reads.
    const items = floors.map((f, i) => item(f, i, here)).reverse();
    el.replaceChildren(h('div.floor-menu-head', {}, `${floors.length} deck${floors.length === 1 ? '' : 's'}`), ...items, add);
  };

  const place = () => {
    const r = anchor.getBoundingClientRect();
    el.style.left = `${r.left}px`;
    el.style.top = `${r.bottom + 8}px`;
  };

  const onDown = (e: PointerEvent) => {
    const t = e.target as Node;
    if (!el.contains(t) && !anchor.contains(t)) close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  const offs = [store.on('floors', render), store.on('floor', render)];
  const close = () => {
    if (current?.el !== el) return;
    current = null;
    el.remove();
    anchor.classList.remove('open');
    window.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', place);
    for (const off of offs) off();
  };
  render();
  document.body.append(el);
  place();
  anchor.classList.add('open');
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', place);
  current = { el, close };
}
