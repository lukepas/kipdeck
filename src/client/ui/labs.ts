import './labs.css';
// The Labs window: the parts beyond the inbox, each with one switch, all on as the office ships.
// Admins switch them for everyone; anyone else sees which are on. Shared by the home page and the
// Deck, so it loads no three.js.
import type { Net } from '../net';
import { store } from '../state';
import { LAB_IDS, LAB_META, type LabId, type LabsState } from '../../shared/labs';
import { h, openModal } from './dom';

/** The line over the switches: every lab ships on. */
export const labsIntro = (admin: boolean): string =>
  admin ? 'Everything here is on unless you switch it off. Switching changes it for everyone in this office.' : 'Everything here is on unless an admin switches it off.';

/** Is this lab held from the command line, and which way? */
export const labHeld = (state: LabsState | undefined, id: LabId): 'on' | 'off' | null =>
  state?.heldOff?.includes(id) ? 'off' : state?.forced.includes(id) ? 'on' : null;

/** Opens Labs. It redraws itself while open when anyone switches a lab. */
export function openLabs(net: Net) {
  const body = h('div.body.labs');
  const el = h('div.modal.labs-modal', { role: 'dialog', 'aria-label': 'Labs' }, h('header', {}, h('h2', {}, 'Labs')), body);

  const render = () => {
    const state = store.labs;
    const admin = !!store.me.admin;
    body.replaceChildren(
      h('p.labs-intro', {}, labsIntro(admin)),
      h('ul.labs-list', {}, ...LAB_IDS.map((id) => row(id, !!state?.on[id], labHeld(state, id), admin))),
    );
  };

  function row(id: LabId, on: boolean, hold: 'on' | 'off' | null, admin: boolean): HTMLElement {
    const meta = LAB_META[id];
    const name = `lab-${id}`;
    const toggle = h('button.btn.labs-toggle', {
      type: 'button',
      role: 'switch',
      'aria-checked': String(on),
      'aria-labelledby': name,
      class: on ? 'on' : '',
      disabled: !admin || !!hold,
      title: hold === 'off' ? 'Held off from the command line (--labs -name, or --labs none)' : hold === 'on' ? 'Held on from the command line (--labs, or a chain flag)' : admin ? (on ? 'Switch off' : 'Switch on') : 'Only admins can switch labs',
      onclick: () => net.send({ t: 'labs.set', patch: { [id]: !on } }),
    }, on ? 'On' : 'Off');
    // The Deck is a route of its own: it opens whether the home page links to it or not.
    const extra = id === 'bridge' ? h('a.labs-link', { href: '/deck' }, 'Enter the Deck') : null;
    return h(
      'li.labs-row',
      { class: on ? 'on' : '' },
      h('div.labs-text', {}, h('span.labs-name', { id: name }, meta.name), h('span.labs-what', {}, meta.what), extra),
      toggle,
    );
  }

  render();
  const offs = [store.on('labs', render), store.on('me', render)];
  openModal(el, { onClose: () => offs.forEach((off) => off()) });
}
