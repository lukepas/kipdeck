// The phone buzz (src/client/buzz.ts): nothing until the page has had a real tap, click or key press,
// since Chrome refuses navigator.vibrate before that and logs a console error on every untouched tab.
import { before, test } from 'node:test';
import assert from 'node:assert/strict';

const calls: number[] = [];
const win = new EventTarget();
let buzz: () => void;

/** An event as the browser sends it (isTrusted), or as a script makes one (not). */
function event(type: string, isTrusted: boolean): Event {
  const e = new Event(type);
  Object.defineProperty(e, 'isTrusted', { value: isTrusted });
  return e;
}

before(async () => {
  Object.defineProperty(globalThis, 'window', { value: win, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'navigator', { value: { vibrate: (ms: number) => (calls.push(ms), true) }, configurable: true, writable: true });
  ({ buzz } = await import('../src/client/buzz.js'));
});

test('no buzz before the page has had a tap, click or key press', () => {
  buzz();
  assert.deepEqual(calls, []);
});

test('a scripted pointerdown does not count as a tap', () => {
  win.dispatchEvent(event('pointerdown', false));
  buzz();
  assert.deepEqual(calls, []);
});

test('a buzz once someone has tapped the page', () => {
  win.dispatchEvent(event('pointerdown', true));
  buzz();
  buzz();
  assert.deepEqual(calls, [200, 200]);
});
