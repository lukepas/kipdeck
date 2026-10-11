// The pane before the first agent: the three steps of the loop, side by side. It works (on a branch
// of its own), it asks (only when it needs a decision), you review (the diff, then Merge). Each step
// has a small row drawn with the inbox's own row styles, lit one after another (CSS in preview.css;
// all lit under reduced motion), and the strip is marked as a preview so nobody takes it for an
// agent of theirs.

import { h } from '../ui/dom';
import './preview.css';

/** The three steps, in the words the strip uses (tests read them). */
export const LOOP_STEPS = [
  { cls: 'working', title: 'It works', line: 'On a branch of its own, while you do something else.', status: 'Edit: web/checkout.test.js', age: '2m', act: '' },
  { cls: 'needs-you', title: 'It asks', line: 'Only when it needs a decision. It lands in Needs you.', status: 'Needs an answer', age: 'waiting 40s', act: 'Answer' },
  { cls: 'review', title: 'You review', line: 'The diff and what it did. Merge, or send it back.', status: '1 file, +4 -2', age: 'ready 1m', act: 'Merge' },
] as const;

export function preview(): HTMLElement {
  return h(
    'div.pv',
    { 'aria-label': 'How it works (a preview)' },
    h('p.pv-tag', {}, 'Preview'),
    h('h2', {}, 'How it works'),
    h(
      'ol.pv-steps',
      {},
      ...LOOP_STEPS.map((s, i) =>
        h(
          'li.pv-step',
          { class: `pv-${s.cls}`, style: `--i:${i}` },
          h('span.pv-n', { 'aria-hidden': 'true' }, String(i + 1)),
          h('b.pv-sec', {}, s.title),
          h('span.pv-line', {}, s.line),
          h(
            'span.pv-row',
            { 'aria-hidden': 'true' },
            h('span.agent-mark.p-claude', {}, 'CC'),
            h('span.pv-text', {}, h('span.pv-title', {}, 'Fix the flaky checkout test'), h('span.pv-status', {}, s.status)),
            s.act ? h('span.pv-act', {}, s.act) : h('span.pv-age', {}, s.age),
          ),
        ),
      ),
    ),
    h('p.pv-note', {}, 'You only hear from an agent when it needs an answer or has something to merge.'),
  );
}
