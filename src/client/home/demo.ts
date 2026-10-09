// The demo's pill in the top bar (`kipdeck --demo`, see shared/demo.ts): one short line saying the
// agents are scripted, with the command to run it for real (or, in the hosted demo before npm, an ask
// for access), so the inbox itself starts at the top of the list. On a phone it is the tag alone. The whole note is its tooltip. A demo office has no Get started checklist (shipped.ts):
// the demo shows the loop, it doesn't teach it.
import { demoNote, type DemoInfo } from '../../shared/demo';
import type { ServerMsg } from '../../shared/protocol';
import { h } from '../ui/dom';
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
  where.replaceChildren();
  where.classList.toggle('hidden', !demo);
  if (!demo) return home.change();
  const note = demoNote(demo);
  where.title = note.command ? `${note.text} ${note.lead}: ${note.command}` : note.text;
  const lead = note.href ? h('a.demo-lead', { href: note.href, target: '_blank', rel: 'noopener' }, note.lead) : h('span.demo-lead', {}, note.command ? `${note.lead}:` : note.lead);
  where.append(h('span.demo-tag', {}, 'Demo'), h('span.demo-text', {}, note.short), h('span.demo-run', {}, lead, note.command ? copyLine(note.command) : null));
  home.change();
}
