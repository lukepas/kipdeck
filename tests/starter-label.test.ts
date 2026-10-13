// The first-task box on the setup card (src/client/home/starter.ts) is named by the question over it,
// "What were you about to ask Claude Code?", through <label for>. An aria-label on the box would win
// over that label and give it a name that doesn't contain the words people see (WCAG 2.5.3, label in
// name), so a speech user saying "click What were you about to ask" would miss it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeElement, installFakeDom } from './support/fake-dom.js';

installFakeDom();
const { askLine, taskBox } = await import('../src/client/home/starter.js');

/** An element's text, as a screen reader would read it off a label. */
const text = (el: FakeElement): string => el.childNodes.map((n) => (n instanceof FakeElement ? text(n) : (n as unknown as { data: string }).data)).join('');

test('the first-task box takes its name from the visible question over it', () => {
  const card = taskBox({ starters: [] } as never, 'claude', true, undefined, () => {}) as unknown as FakeElement;
  const box = card.querySelector('textarea')!;
  assert.equal(box.getAttribute('aria-label'), null, 'no aria-label to override the visible label');
  assert.equal(box.getAttribute('aria-labelledby'), null);
  const label = card.querySelector('label')!;
  assert.equal(label.getAttribute('for'), box.id);
  assert.equal(text(label), askLine('claude'));
  assert.match(text(label), /^What were you about to ask Claude Code\?$/);
});
