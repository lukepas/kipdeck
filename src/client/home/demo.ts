// The demo (`kipdeck --demo`, see shared/demo.ts): a small Demo tag in the top bar (the whole note is
// its tooltip), and the coach strip over the inbox (coach.ts, loaded only in a demo office), which
// walks the loop the demo opens with and ends on "That's the loop. Now run it on your repo." A demo
// office has no Get started checklist (shipped.ts): the strip is its guide.
import { demoNote, type DemoInfo } from '../../shared/demo';
import type { ServerMsg } from '../../shared/protocol';
import { h } from '../ui/dom';
import { home } from './state';
import './demo.css';

let shown = false;

/** Shows (or takes away) the tag and the strip, from the welcome message. */
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
  if (demo) {
    const note = demoNote(demo);
    where.title = note.text;
    where.append(h('span.demo-tag', {}, 'Demo'), h('span.demo-text', {}, note.short));
  }
  if (demo || shown) {
    shown = true;
    void import('./coach').then((m) => m.showCoach(demo));
  }
  home.change();
}

