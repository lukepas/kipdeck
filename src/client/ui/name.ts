// Your name, the first time this browser comes in on the shared password: one box, nothing else,
// in the 3D office and the 2D view alike. Your look is dealt at random (Settings > Your character
// changes it), so the office and its workers are what you see first. With an account of your own,
// your name is that account's and this never opens.

import './name.css';
import { randomName } from '../../shared/avatar';
import { h, openModal } from './dom';

/** Asks for a name, then `done` with it. ✕ or Esc goes in with the made-up one in the box. */
export function askName(done: (name: string) => void) {
  const made = randomName();
  const input = h('input', { type: 'text', maxlength: 24, placeholder: made, 'aria-label': 'Your name', autocomplete: 'nickname' }) as HTMLInputElement;
  const form = h(
    'form.modal.name-ask',
    { role: 'dialog', 'aria-label': 'Your name' },
    h('header', {}, h('h2', {}, 'Who is it?')),
    h('div.body', {}, h('p', {}, 'Your teammates see this name on what you type and send. Leave it blank to go by the one in the box.'), input),
    h('footer', {}, h('button.btn.primary', { type: 'submit' }, 'Come on in')),
  ) as HTMLFormElement;
  let sent = false;
  const typed = () => input.value.trim().slice(0, 24) || made;
  const finish = () => {
    if (sent) return;
    sent = true;
    done(typed());
  };
  const modal = openModal(form, { backdropCloses: false, onClose: finish });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    modal.close();
  });
  setTimeout(() => input.focus(), 30);
}
