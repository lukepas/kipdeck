// Pair a phone's keyboard (src/client/ui/pair.ts), on a stand-in DOM (tests/support/fake-dom.ts): the
// address radios are made once per code, so picking one keeps focus on the radio just pressed; the group
// is one tab stop whose arrow keys move the pick; and New code puts focus on the New code button that
// replaces the one pressed, not on the page.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import type { PairOffer } from '../src/shared/devices.js';
import { FakeElement, fakeDocument, installFakeDom } from './support/fake-dom.js';

installFakeDom();
const { closeAllModals } = await import('../src/client/ui/dom.js');
const { openPair } = await import('../src/client/ui/pair.js');

let made = 0;
const offer = (): PairOffer => ({
  id: `p${++made}`,
  token: `t${made}`,
  expiresAt: Date.now() + 600_000,
  loopbackOnly: false,
  addresses: [
    { base: 'https://kipdeck.example.ts.net', secure: true, via: 'tailnet' },
    { base: 'http://192.168.1.23:4600', secure: false, via: 'lan' },
    { base: 'http://localhost:4600', secure: false, via: 'page' },
  ],
});
const g = globalThis as Record<string, unknown>;
g.fetch = async (url: string) => ({ ok: true, json: async () => (String(url).startsWith('/api/pair/status') ? { expired: false } : offer()) });
after(() => closeAllModals());

const win = () => fakeDocument.querySelector('.pair')!;
const radios = () => win().querySelectorAll('[role="radio"]');
const checked = () => radios().findIndex((r) => r.getAttribute('aria-checked') === 'true');
const key = (el: FakeElement, k: string) => {
  const e = new Event('keydown', { cancelable: true });
  Object.defineProperty(e, 'key', { value: k });
  el.dispatchEvent(e);
};
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

test('picking an address keeps focus on it; the arrows move the pick; New code keeps focus on New code', async () => {
  await openPair();
  const [first, second] = radios();
  assert.equal(radios().length, 3);
  assert.equal(checked(), 0);
  assert.deepEqual(radios().map((r) => r.getAttribute('tabindex')), ['0', '-1', '-1'], 'one tab stop: the checked radio');

  second.focus();
  second.dispatchEvent(new Event('click'));
  assert.equal(checked(), 1);
  assert.equal(radios()[1], second, 'the same button, not a new one');
  assert.equal(fakeDocument.activeElement, second, 'focus stays on the radio just pressed');
  assert.ok(second.classList.contains('on') && !first.classList.contains('on'));
  assert.match((win().querySelector('.pair-link') as unknown as { textContent: string }).textContent, /192\.168\.1\.23/, 'the link is for the picked address');

  const group = win().querySelector('[role="radiogroup"]')!;
  key(group, 'ArrowRight');
  assert.equal(checked(), 2);
  assert.equal(fakeDocument.activeElement, radios()[2]);
  key(group, 'ArrowRight');
  assert.equal(checked(), 0, 'wraps around');
  key(group, 'End');
  assert.equal(checked(), 2);
  key(group, 'ArrowLeft');
  assert.equal(checked(), 1);
  assert.equal(fakeDocument.activeElement, radios()[1]);

  const again = win().querySelector('.pair-again')!;
  again.focus();
  again.dispatchEvent(new Event('click'));
  await tick();
  await tick();
  const fresh = win().querySelector('.pair-again')!;
  assert.notEqual(fresh, again, 'a new code draws a new window body');
  assert.equal(fakeDocument.activeElement, fresh, 'focus moves to the new New code button');
});
