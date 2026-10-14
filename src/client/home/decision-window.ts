// One open decision in full (Your call, yourcall.ts): the question, the project, who asked and since
// when, each option with the default marked, and a line for something else. Answer writes it under
// Answer: in .rundown/decisions.md (admins only) and tells the agent that asked. The close button and Esc close
// it without answering, and it closes by itself once the decision is answered. Loaded the first time
// a decision is opened (home/lazy.ts).

import { ANSWER_MAX } from '../../shared/rundown/answer';
import { decisionStatus } from '../../shared/yourcall';
import { store } from '../state';
import { h, openModal, type Modal } from '../ui/dom';
import { answerDecision } from './yourcall';
import './yourcall.css';

let openNow: Modal | undefined;

const find = (floor: string, id: string) => {
  const f = store.yourCall.find((x) => x.floor === floor);
  const d = f?.decisions.find((x) => x.id === id);
  return f && d ? { f, d } : undefined;
};

/** Opens decision `id` on `floor`. */
export function openDecisionWindow(floor: string, id: string) {
  const s = find(floor, id);
  if (!s) return;
  openNow?.close();
  const { f, d } = s;
  const admin = !!store.me.admin;
  const name = `yc-${f.floor}-${d.id}`;
  const radios = d.options.map((o, i) => {
    const input = h('input', { type: 'radio', name, value: o, checked: o === d.default || (!d.default && i === 0), disabled: !admin }) as HTMLInputElement;
    return { input, el: h('label.yc-option', {}, input, h('span', {}, o), o === d.default ? h('span.yc-default', {}, 'default') : null) };
  });
  const otherBox = h('input', { type: 'radio', name, value: '', disabled: !admin }) as HTMLInputElement;
  const other = h('input.yc-other-text', { type: 'text', maxlength: String(ANSWER_MAX), placeholder: 'Something else...', 'aria-label': 'Another answer', disabled: !admin }) as HTMLInputElement;
  other.addEventListener('input', () => (otherBox.checked = !!other.value.trim() || otherBox.checked));
  const answer = h('button.btn.primary', { type: 'button', disabled: !admin }, 'Answer');
  const facts: [string, string][] = [
    ['Project', f.floorName],
    ['Status', decisionStatus(d, Date.now())],
    ...(d.raisedBy ? ([['Asked by', d.raisedBy.name]] as [string, string][]) : []),
  ];
  const el = h(
    'div.modal.yc-decision',
    { role: 'dialog', 'aria-label': `Decision ${d.id}` },
    h('header', {}, h('h2', {}, `Decision ${d.id}`)),
    h(
      'div.body',
      {},
      h('p.yc-question', {}, d.question),
      h('dl.yc-facts', {}, ...facts.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
      h('fieldset.yc-options', {}, h('legend', {}, 'Your call'), ...radios.map((r) => r.el), h('label.yc-option.yc-other', {}, otherBox, other)),
      h(
        'p.yc-hint',
        {},
        admin
          ? `Answer writes it under Answer: in .rundown/decisions.md${d.raisedBy ? ` and tells ${d.raisedBy.name}` : ''}. Nothing else in the file changes.`
          : 'Only an admin answers decisions. Until then the work goes on with the default.',
      ),
    ),
    h('footer', {}, answer),
  );
  let off = () => {};
  const modal = openModal(el, {
    doing: 'making a call',
    onClose: () => {
      off();
      if (openNow === modal) openNow = undefined;
    },
  });
  openNow = modal;
  off = store.on('yourcall', () => {
    if (!find(floor, id)) modal.close();
  });
  answer.addEventListener('click', () => {
    const picked = radios.find((r) => r.input.checked)?.input.value ?? (otherBox.checked ? other.value.trim() : '');
    if (!picked) return other.focus();
    const now = find(floor, id);
    if (now) answerDecision(now, picked);
    modal.close();
  });
  setTimeout(() => (radios.find((r) => r.input.checked)?.input ?? answer).focus(), 30);
}
