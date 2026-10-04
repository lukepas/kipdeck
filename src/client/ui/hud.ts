import './hud.css';
import { h, openModal } from './dom';
import { HELP_ROWS } from './help';
import { icon, isIcon } from './icons';

export function openHelp() {
  const close = h('button.btn.close', { 'aria-label': 'Close' }, icon('close', 16));
  const el = h(
    'div.modal',
    { role: 'dialog', 'aria-label': 'Controls' },
    h('header', {}, h('h2', {}, 'Controls'), close),
    h('div.body', {}, h('div.help-grid', {}, ...HELP_ROWS.flatMap(([k, v]) => [isIcon(k) ? h('span.key.key-icon', { 'aria-hidden': 'true' }, icon(k, 14)) : h('span.key', {}, k), h('span', {}, v)]))),
  );
  const modal = openModal(el);
  close.addEventListener('click', () => modal.close());
}
