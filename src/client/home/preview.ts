// The pane before the first agent: a short looping preview of what happens next, drawn with the
// inbox's own row styles rather than words. One agent row moves from Working to Needs you to To review
// to Shipped today, a step every few seconds (CSS in preview.css; still under reduced motion). It is marked
// as a preview so nobody mistakes it for an agent of theirs.

import { h } from '../ui/dom';
import './preview.css';

const STEPS = [
  { cls: 'working', section: 'Working', status: 'Edit: web/checkout.test.js', age: '2m', act: '' },
  { cls: 'needs-you', section: 'Needs you', status: 'Needs an answer', age: 'waiting 40s', act: 'Answer' },
  { cls: 'review', section: 'To review', status: '1 file, +4 -2', age: 'ready 1m', act: 'Merge' },
  { cls: 'shipped', section: 'Shipped today', status: 'waited on you 40s', age: '10:42', act: '' },
] as const;

export function preview(): HTMLElement {
  return h(
    'div.pv',
    { 'aria-label': 'What happens next (a preview)' },
    h('p.pv-tag', {}, 'Preview'),
    h('h2', {}, 'What happens next'),
    h(
      'ol.pv-steps',
      {},
      ...STEPS.map((s, i) =>
        h(
          'li.pv-step',
          { class: `pv-${s.cls}`, style: `--i:${i}` },
          h('span.pv-sec', {}, s.section),
          h(
            'span.pv-row',
            {},
            h('span.agent-mark.p-claude', { 'aria-hidden': 'true' }, 'CC'),
            h('span.pv-text', {}, h('span.pv-title', {}, 'Fix the flaky checkout test'), h('span.pv-status', {}, s.status)),
            h('span.pv-age', {}, s.age),
            s.act ? h('span.pv-act', {}, s.act) : null,
          ),
        ),
      ),
    ),
    h('p.pv-note', {}, 'You only hear from an agent when it needs an answer or has something to merge.'),
  );
}
