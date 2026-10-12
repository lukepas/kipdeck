// A moment card (the start of watch's still card, a celebration's card) yields Esc to a selected unit,
// as the debrief does: Esc lets go of the selection before it does anything else (docs/controls.md).
// The deck's own selecting test met this only on a slow machine, where the still card came up after the
// click that selected a unit and took the Esc meant for it.
import test from 'node:test';
import assert from 'node:assert/strict';

/** Just enough of the page for MomentCards: elements it builds and appends, and a window for its keys. */
class StubElement {
  className = '';
  hidden = false;
  textContent = '';
  innerHTML = '';
  readonly children: unknown[] = [];
  readonly classList = { add() {}, remove() {} };
  get content() {
    return { firstElementChild: new StubElement() };
  }
  setAttribute() {}
  addEventListener() {}
  append(...c: unknown[]) {
    this.children.push(...c);
  }
  replaceChildren(...c: unknown[]) {
    this.children.splice(0, this.children.length, ...c);
  }
}

const keys = new EventTarget();
const g = globalThis as Record<string, unknown>;
g.Node = StubElement;
g.document = { createElement: () => new StubElement(), getElementById: () => null, body: new StubElement(), pointerLockElement: null };
g.window = { addEventListener: keys.addEventListener.bind(keys), setTimeout, clearTimeout };
g.requestAnimationFrame = () => 0;

const { MomentCards } = await import('../src/client/features/moments/card.ts');

function esc() {
  const e = Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' });
  let stopped = false;
  e.stopPropagation = () => void (stopped = true);
  keys.dispatchEvent(e);
  return { prevented: e.defaultPrevented, stopped };
}

test('Esc puts a moment card away when nothing is selected, and gives the mouse back', () => {
  let back = 0;
  const cards = new MomentCards(
    () => back++,
    () => false,
  );
  cards.show({ title: 'WATCH LOG', lines: ['All quiet.'] }, 60_000);
  const e = esc();
  assert.deepEqual(e, { prevented: true, stopped: true });
  assert.equal(cards.card, null);
  assert.equal(back, 1);
});

test('with a unit selected, Esc goes on to the selection and the moment card stays', () => {
  let back = 0;
  let selected = true;
  const cards = new MomentCards(
    () => back++,
    () => selected,
  );
  cards.show({ title: 'WATCH LOG', lines: ['All quiet.'] }, 60_000);
  assert.deepEqual(esc(), { prevented: false, stopped: false }, 'the key goes on to the selection');
  assert.notEqual(cards.card, null);
  assert.equal(back, 0);
  // Once the unit has let go, the next Esc is the card's.
  selected = false;
  assert.deepEqual(esc(), { prevented: true, stopped: true });
  assert.equal(cards.card, null);
  cards.close(false);
});
