// The demo's note over the inbox (`mergeline --demo`, see shared/demo.ts): one calm line saying the
// agents are scripted, with the command to run it for real. In the read-only hosted demo the Get
// started checklist goes too, since nobody watching can do its steps.
import { demoNote, type DemoInfo } from '../../shared/demo';
import type { ServerMsg } from '../../shared/protocol';
import { h } from '../ui/dom';
import { copyLine } from './setup';
import './demo.css';

/** Shows (or takes away) the note, from the welcome message. */
export function demoMessage(msg: ServerMsg, where: HTMLElement) {
  if (msg.t !== 'welcome') return;
  renderDemo(msg.demo, where);
}

export function renderDemo(demo: DemoInfo | undefined, where: HTMLElement) {
  document.body.classList.toggle('demo-office', !!demo);
  document.body.classList.toggle('demo-read-only', !!demo?.readOnly);
  where.replaceChildren();
  where.classList.toggle('hidden', !demo);
  if (!demo) return;
  const note = demoNote(demo);
  where.append(h('span.demo-tag', {}, 'Demo'), h('span.demo-text', {}, note.text), h('span.demo-run', {}, h('span.demo-lead', {}, note.lead), copyLine(note.command)));
}
