// Where the keyboard goes on the Approval card (src/client/home/approval-card.ts, approval.ts), on a
// stand-in DOM (tests/support/fake-dom.ts). Every draw makes the card's controls anew, so focus that
// was in the card must land on a control in it again, never fall to the page: Deny... opens the reason
// box, Back returns to Deny..., an answer leaves it on the card, a redraw keeps the reason box, and the
// next queued request comes up with focus on its card (not on Allow once, so a second Enter can't
// approve it).
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeElement, fakeDocument, installFakeDom } from './support/fake-dom.js';

installFakeDom();
const { h } = await import('../src/client/ui/dom.js');
const { paintApproval } = await import('../src/client/home/approval-card.js');
const { approvalCard } = await import('../src/client/home/approval.js');
const { store } = await import('../src/client/state/index.js');
// The card loads what it draws lazily: load it once up front, so a draw is a then() away.
await (await import('../src/client/home/lazy.js')).approval();
import type { ApprovalView, RosterEntry } from '../src/shared/protocol.js';
import type { CardState } from '../src/client/home/approval-card.js';

const view = (id: string): ApprovalView => ({ id, workerId: 'w1', floor: 'f1', title: 'Run npm test', tool: 'Bash', command: 'npm test', paths: [], risks: [], always: 'Bash(npm test:*)', at: 0 });
const active = () => fakeDocument.activeElement;
const k = (card: HTMLElement, key: string) => (card as unknown as FakeElement).querySelector(`[data-k="${key}"]`)!;
const click = (el: FakeElement) => el.dispatchEvent(new Event('click'));
/** Lets the (already loaded) lazy import's then() run. */
const settle = () => new Promise<void>((r) => setTimeout(r, 0));

let card: HTMLElement;
beforeEach(() => {
  installFakeDom();
  card = h('section.ap-card', { tabindex: '-1' });
  fakeDocument.body.append(card as unknown as FakeElement);
});

function draw(s: CardState, answered: string[] = []) {
  paintApproval(card, view('a1'), s, (d) => {
    answered.push(d);
    s.sent = true;
    paintApproval(card, view('a1'), s, () => {});
  });
}

test('Deny... puts focus in the reason box, and Back puts it on Deny... again', () => {
  const s: CardState = { sent: false, denying: false, behind: 0 };
  draw(s);
  k(card, 'deny-open').focus();
  click(k(card, 'deny-open'));
  assert.equal(active(), k(card, 'reason'), 'the reason box has focus');
  k(card, 'back').focus();
  click(k(card, 'back'));
  assert.equal(s.denying, false);
  assert.equal(active(), k(card, 'deny-open'), 'Back gives focus to Deny..., not to the page');
});

test('an answer keeps focus on the card while its buttons are disabled', () => {
  const s: CardState = { sent: false, denying: false, behind: 0 };
  const answered: string[] = [];
  draw(s, answered);
  k(card, 'once').focus();
  click(k(card, 'once'));
  assert.deepEqual(answered, ['once']);
  assert.ok(k(card, 'once').hasAttribute('disabled'));
  assert.equal(active(), card, 'the card itself has focus, with "Sent" in it');
});

test('a redraw keeps the control that had focus, the reason box included', () => {
  const s: CardState = { sent: false, denying: false, behind: 0 };
  draw(s);
  k(card, 'always').focus();
  s.behind = 2;
  draw(s);
  assert.equal(active(), k(card, 'always'));
  s.denying = true;
  draw(s);
  k(card, 'reason').focus();
  draw(s);
  assert.equal(active(), k(card, 'reason'));
});

test('a redraw with focus elsewhere leaves it there', () => {
  const s: CardState = { sent: false, denying: false, behind: 0 };
  const other = h('button', {});
  fakeDocument.body.append(other as unknown as FakeElement);
  draw(s);
  other.focus();
  draw(s);
  assert.equal(active(), other);
});

test('the next queued request comes up with focus on its card, never on Allow once', async () => {
  const sent: unknown[] = [];
  const net = { up: true, onMessage: () => {}, send: (m: unknown) => sent.push(m) };
  const ap = approvalCard(net as never);
  fakeDocument.body.append(ap.el as unknown as FakeElement);
  const e = { id: 'w1' } as RosterEntry;
  store.approvals.set('w1', [view('a1'), view('a2')]);
  assert.equal(ap.show(e), true);
  await settle();
  k(ap.el, 'once').focus();
  click(k(ap.el, 'once'));
  await settle();
  assert.equal(active(), ap.el, 'answered: focus on the card');
  // The office drops the answered request: the card shows the next one.
  store.approvals.set('w1', [view('a2')]);
  ap.show(e);
  await settle();
  assert.equal(active(), ap.el, 'the next request has focus on its card, not on the page');
  assert.ok(!k(ap.el, 'once').hasAttribute('disabled'), 'and it can be answered');
  // Answered somewhere else (its terminal, another device) while focus is on one of its buttons.
  k(ap.el, 'always').focus();
  store.approvals.set('w1', [view('a3')]);
  ap.show(e);
  await settle();
  assert.equal(active(), ap.el, 'the request after it has focus on its card too');
  store.approvals.delete('w1');
});
