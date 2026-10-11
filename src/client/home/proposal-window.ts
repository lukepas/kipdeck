// An agent's request in full (the agent gate, shared/gate.ts): who asks, what, to whom and the whole
// text, with Approve and Reject and a reason for the agent. The close button and Esc close it without deciding, and
// it closes by itself once anyone decides. Loaded the first time a request is opened (home/lazy.ts).

import { GATE_ACTION_LABEL, GATE_NOTE_MAX, proposalTitle, proposerName, targetWords } from '../../shared/gate';
import type { Net } from '../net';
import { store } from '../state';
import { h, openModal, type Modal } from '../ui/dom';
import './proposal-window.css';

let openNow: { id: string; modal: Modal } | undefined;

/** Opens request `id` in full. */
export function openProposalWindow(net: Net, id: string) {
  const p = store.gate.proposals.find((x) => x.id === id);
  if (!p) return;
  openNow?.modal.close();
  const who = proposerName(p);
  const note = h('textarea.gate-note', { rows: 2, maxlength: String(GATE_NOTE_MAX), placeholder: 'Optional: why not (the agent is told)', 'aria-label': 'Reason for rejecting, told to the agent' }) as HTMLTextAreaElement;
  const reject = h('button.btn', { type: 'button' }, 'Reject');
  const approve = h('button.btn.primary', { type: 'button' }, 'Approve');
  const facts: [string, string][] = [
    ['Asked by', who === p.by.name ? p.by.name : `${who} (${p.by.name})`],
    ['Project', p.floorName],
    ['Wants to', GATE_ACTION_LABEL[p.action]],
    ...(p.action === 'hire' ? [] : ([['For', targetWords(p)]] as [string, string][])),
    ...(p.merged && p.targets?.length ? ([['Which is now', p.targets.join(', ')]] as [string, string][]) : []),
  ];
  const el = h(
    'div.modal.gate-proposal',
    { role: 'dialog', 'aria-label': 'Agent request' },
    h('header', {}, h('h2', {}, 'Agent request')),
    h(
      'div.body',
      {},
      h('p.gate-title', {}, proposalTitle(p)),
      h('dl.gate-facts', {}, ...facts.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
      p.details?.length ? h('ul.gate-details', {}, ...p.details.map((d) => h('li', {}, d))) : null,
      p.text ? h('div.gate-text-wrap', {}, h('div.gate-label', {}, p.action === 'hire' ? 'The new agent\'s task, in full' : 'The message, in full'), h('pre.gate-text', { tabindex: '0' }, p.text)) : null,
      h('p.gate-hint', {}, 'Approve runs it exactly as the agent asked. Reject tells the agent it did not happen. Standing permissions are in Settings > Agents.'),
      note,
    ),
    h('footer', {}, reject, approve),
  );
  let off = () => {};
  const modal = openModal(el, {
    doing: 'deciding an agent request',
    onClose: () => {
      off();
      if (openNow?.modal === modal) openNow = undefined;
    },
  });
  openNow = { id, modal };
  off = store.on('gate', () => {
    if (!store.gate.proposals.some((x) => x.id === id)) modal.close();
  });
  const send = (ok: boolean) => {
    net.send({ t: 'gate.decide', id, approve: ok, ...(!ok && note.value.trim() ? { note: note.value.trim() } : {}) });
    modal.close();
  };
  approve.addEventListener('click', () => send(true));
  reject.addEventListener('click', () => send(false));
  setTimeout(() => approve.focus(), 30);
}
