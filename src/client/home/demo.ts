// The demo's pill in the top bar (`kipdeck --demo`, see shared/demo.ts): one short line saying the
// agents are scripted, with the command to run it for real (the hosted demo: to run the demo on your
// computer), so the inbox itself starts at the top of the list. On a phone it is the tag alone. The whole note is its tooltip. A demo office has no Get started checklist (shipped.ts):
// the demo shows the loop, it doesn't teach it.
import { demoNote, fitsPill, type DemoInfo } from '../../shared/demo';
import type { ServerMsg } from '../../shared/protocol';
import { h, toast } from '../ui/dom';
import { icon } from '../ui/icons';
import { copyLine } from './setup';
import { home } from './state';
import './demo.css';

/** Shows (or takes away) the note, from the welcome message. */
export function demoMessage(msg: ServerMsg, where: HTMLElement) {
  if (msg.t !== 'welcome') return;
  renderDemo(msg.demo, where);
}

export function renderDemo(demo: DemoInfo | undefined, where: HTMLElement) {
  document.body.classList.toggle('demo-office', !!demo);
  document.body.classList.toggle('demo-read-only', !!demo?.readOnly);
  home.demo = !!demo;
  home.readOnly = !!demo?.readOnly;
  where.replaceChildren();
  where.classList.toggle('hidden', !demo);
  if (!demo) return home.change();
  const note = demoNote(demo);
  where.title = note.text;
  where.append(h('span.demo-tag', {}, 'Demo'), h('span.demo-text', {}, note.short), h('span.demo-run', {}, h('span.demo-lead', {}, `${note.lead}:`), runLine(note.command)));
  home.change();
}

/** The command to copy: shown when it's short, else a Copy command button (shared/demo.ts fitsPill). */
function runLine(command: string): HTMLElement {
  if (fitsPill(command)) return copyLine(command);
  const btn = h('button.btn.quiet.small.copy.copy-cmd', { type: 'button', title: command, 'aria-label': `Copy ${command}` }, icon('copy', 12), 'Copy command');
  btn.addEventListener('click', () => {
    void navigator.clipboard?.writeText(command).then(
      () => toast('Copied'),
      () => {},
    );
  });
  return h('span.fix', {}, btn);
}
