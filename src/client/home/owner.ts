// Mine / Team in the top bar: the inbox for everyone's agents, or only the ones you deployed (each
// agent's owner is who deployed it, RosterEntry.createdBy). It shows once more than one person has
// agents here, or while Mine is on, so a solo inbox has nothing extra to read.

import { h } from '../ui/dom';
import { owners } from './list';
import { home } from './state';
import './owner.css';

export function renderOwner(root: HTMLElement) {
  const shown = owners().size > 1 || home.owner === 'mine';
  root.classList.toggle('hidden', !shown);
  if (!shown) return root.replaceChildren();
  const opt = (id: typeof home.owner, label: string, title: string) =>
    h('button.btn.owner-opt', { type: 'button', 'aria-pressed': String(home.owner === id), title, onclick: () => home.owner !== id && home.setOwner(id) }, label);
  root.replaceChildren(opt('mine', 'Mine', 'Only the agents you deployed'), opt('team', 'Team', "Everyone's agents"));
}
