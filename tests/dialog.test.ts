// The window primitive behind openModal (src/client/ui/dom.ts, ui/dialog.ts), on a stand-in DOM
// (tests/support/fake-dom.ts): a <dialog> opened with showModal() under #modal-root, named and
// aria-modal, focus put inside and given back, Esc closing only the top window and never one with
// escCloses false, byEsc reported, onModalChange heard on every open and close, and the toasts riding
// on the top window. The real browser's side (Tab staying in, the Deck's mouse-look) is in
// tests/dialog-e2e.test.ts.
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeElement, fakeDocument, installFakeDom, press } from './support/fake-dom.js';

installFakeDom();
const { closeAllModals, h, modalOpen, onModalChange, openModal } = await import('../src/client/ui/dom.js');
const { restoreTarget, wrapTab } = await import('../src/client/ui/dialog.js');

const heard: boolean[] = [];
onModalChange((open) => heard.push(open));

beforeEach(() => {
  closeAllModals();
  installFakeDom();
  heard.length = 0;
});

/** After the microtask in which a window puts focus inside. */
const tick = () => new Promise<void>((r) => queueMicrotask(r));
const el = (x: unknown) => x as unknown as FakeElement;
const root = () => fakeDocument.getElementById('modal-root')!;
/** A window as the callers build one: a .modal with its own dialog role and label, a header with an h2. */
const win = (title: string, ...body: HTMLElement[]) => h('div.modal', { role: 'dialog', 'aria-label': title }, h('header', {}, h('h2', {}, title)), ...body);

test('a window is a <dialog> opened modally under #modal-root, with aria-modal and the name of its h2', () => {
  const content = win('Settings');
  const m = openModal(content);
  const dlg = el(m.backdrop);
  assert.equal(dlg.localName, 'dialog');
  assert.ok(dlg.classList.contains('backdrop'));
  assert.equal(dlg.parentNode, root());
  assert.equal(dlg.open, true, 'opened with showModal()');
  assert.equal(dlg.getAttribute('aria-modal'), 'true');
  const h2 = el(content).querySelector('h2')!;
  assert.ok(h2.id, 'its h2 was given an id');
  assert.equal(dlg.getAttribute('aria-labelledby'), h2.id);
  // One dialog, not one in another: the content's role and label moved onto the <dialog>.
  assert.equal(el(content).getAttribute('role'), null);
  assert.equal(el(content).getAttribute('aria-label'), null);
  assert.equal(dlg.getAttribute('role'), null, 'a <dialog> is a dialog already');
  m.close();
  assert.equal(el(content).getAttribute('role'), 'dialog', 'the content has its own back once out of the window');
  assert.equal(el(content).getAttribute('aria-label'), 'Settings');
});

test('with no h2 the window is named by the aria-label, and an alertdialog stays one', () => {
  const m = openModal(h('div.modal', { role: 'alertdialog', 'aria-label': 'Stop all 2 agents?' }, h('p', {}, 'Sure?')));
  assert.equal(el(m.backdrop).getAttribute('aria-label'), 'Stop all 2 agents?');
  assert.equal(el(m.backdrop).getAttribute('role'), 'alertdialog');
  assert.equal(el(m.backdrop).getAttribute('aria-labelledby'), null);
});

test('a content with a role of its own (a menu) keeps it, and the window takes its label', () => {
  const m = openModal(h('div.menu', { role: 'menu', 'aria-label': 'Menu' }, h('button.menu-item', {}, 'Settings')), { closeButton: false });
  assert.equal(el(m.el).getAttribute('role'), 'menu');
  assert.equal(el(m.backdrop).getAttribute('aria-label'), 'Menu');
});

test('a side panel is a plain element, not a modal dialog', () => {
  const m = openModal(h('div.proxy'), { side: true, escCloses: false, closeButton: false });
  assert.equal(el(m.backdrop).localName, 'div');
  assert.equal(el(m.backdrop).getAttribute('aria-modal'), null);
  assert.ok(modalOpen());
});

test('focus goes to the first [autofocus], else the first form control, else the ✕', async () => {
  const auto = h('button', { autofocus: true }, 'Go');
  openModal(win('A', h('input', { type: 'text' }), auto));
  await tick();
  assert.equal(fakeDocument.activeElement, el(auto));
  closeAllModals();

  const hidden = h('input', { type: 'hidden' });
  const off = h('textarea', { disabled: true });
  const unseen = h('input', { type: 'text' });
  el(unseen).unfocusable = true;
  const field = h('select', {});
  // A pane hidden only after openModal returns, as Settings hides the panes it isn't on.
  const pane = h('section', {}, h('textarea', {}));
  openModal(win('B', pane, hidden, off, unseen, field));
  el(pane).classList.add('hidden');
  await tick();
  assert.equal(fakeDocument.activeElement, el(field), 'past the hidden, disabled and unshown ones');
  closeAllModals();

  // A window that puts focus somewhere itself keeps it there.
  const own = h('button', {}, 'Mine');
  openModal(win('D', h('input', { type: 'text' }), own));
  own.focus();
  await tick();
  assert.equal(fakeDocument.activeElement, el(own));
  closeAllModals();

  const m = openModal(win('C', h('p', {}, 'Nothing to fill')));
  await tick();
  assert.equal(fakeDocument.activeElement, el(m.el).querySelector('.close'));
});

test('Esc closes only the top window, reports byEsc, and is kept from the page behind', () => {
  const closes: string[] = [];
  const a = openModal(win('A'), { onClose: (byEsc) => closes.push(`A ${byEsc}`) });
  const b = openModal(win('B'), { onClose: (byEsc) => closes.push(`B ${byEsc}`) });
  const e = press('Escape');
  assert.deepEqual(closes, ['B true']);
  assert.ok(e.defaultPrevented, 'so the browser makes no close request of its own');
  assert.equal(el(b.backdrop).isConnected, false);
  assert.equal(el(a.backdrop).isConnected, true);
  press('Escape');
  assert.deepEqual(closes, ['B true', 'A true']);
  assert.equal(modalOpen(), false);
});

test('the ✕ closes with byEsc false', () => {
  let got: boolean | undefined;
  const m = openModal(win('A'), { onClose: (byEsc) => (got = byEsc) });
  el(m.el).querySelector('.close')!.dispatchEvent(new Event('click'));
  assert.equal(got, false);
});

test('escCloses false: Esc and the dialog cancel event leave it open, and a browser close reopens it', () => {
  let closed = 0;
  const m = openModal(win('Mission control'), { escCloses: false, closeButton: true, onClose: () => closed++ });
  const e = press('Escape');
  assert.equal(closed, 0);
  assert.ok(e.defaultPrevented, 'cancelled once the page heard it, so no close request follows');
  const cancel = new Event('cancel', { cancelable: true });
  el(m.backdrop).dispatchEvent(cancel);
  assert.ok(cancel.defaultPrevented);
  assert.equal(closed, 0);
  el(m.backdrop).close();
  assert.equal(el(m.backdrop).open, true, 'shown again');
  assert.equal(closed, 0);
  assert.ok(el(m.el).querySelector('.close'), 'it still has its ✕');
});

test("the dialog's cancel event closes an Esc window as Esc, and only the top one", () => {
  const got: string[] = [];
  const a = openModal(win('A'), { onClose: (byEsc) => got.push(`A ${byEsc}`) });
  openModal(win('B'), { onClose: (byEsc) => got.push(`B ${byEsc}`) });
  el(a.backdrop).dispatchEvent(new Event('cancel', { cancelable: true }));
  assert.deepEqual(got, [], 'A is not on top');
  closeAllModals();
  assert.deepEqual(got, ['B false', 'A false']);
  const c = openModal(win('C'), { onClose: (byEsc) => got.push(`C ${byEsc}`) });
  el(c.backdrop).dispatchEvent(new Event('cancel', { cancelable: true }));
  assert.deepEqual(got.at(-1), 'C true');
});

test('a mousedown on the dialog itself closes it, unless backdropCloses is false', () => {
  const a = openModal(win('A'));
  el(a.el).dispatchEvent(new Event('mousedown'));
  assert.ok(el(a.backdrop).isConnected, 'not one on the content');
  el(a.backdrop).dispatchEvent(new Event('mousedown'));
  assert.equal(el(a.backdrop).isConnected, false);
  const b = openModal(win('B'), { backdropCloses: false });
  el(b.backdrop).dispatchEvent(new Event('mousedown'));
  assert.ok(el(b.backdrop).isConnected);
});

test('onModalChange hears every open and close, with whether a window is still open', () => {
  const a = openModal(win('A'));
  const b = openModal(win('B'));
  b.close();
  a.close();
  assert.deepEqual(heard, [true, true, true, false]);
  a.close();
  assert.equal(heard.length, 4, 'closing twice is once');
});

test('closing gives focus back to what had it at open', async () => {
  const opener = h('button#btn-avatar', {}, 'You');
  fakeDocument.body.append(el(opener));
  el(opener).focus();
  const m = openModal(win('Settings', h('input', { type: 'text' })));
  await tick();
  assert.notEqual(fakeDocument.activeElement, el(opener));
  m.close();
  assert.equal(fakeDocument.activeElement, el(opener));
});

test('stacked windows: closing the top one gives focus back inside the one under it', async () => {
  const a = openModal(win('A', h('input', { type: 'text' })));
  await tick();
  const inA = fakeDocument.activeElement;
  const b = openModal(win('B'));
  await tick();
  assert.notEqual(fakeDocument.activeElement, inA);
  b.close();
  assert.equal(fakeDocument.activeElement, inA);
  a.close();
});

test('which element focus goes back to', () => {
  const dialog = new FakeElement('dialog');
  const inside = new FakeElement('button');
  dialog.append(inside);
  fakeDocument.body.append(dialog);
  const opener = new FakeElement('button');
  fakeDocument.body.append(opener);
  const elsewhere = new FakeElement('input');
  fakeDocument.body.append(elsewhere);
  const ctx = (o: Partial<Parameters<typeof restoreTarget>[1]> = {}) => ({ inMouseLook: false, dialog: el(dialog) as unknown as Element, active: inside as unknown as Element, body: fakeDocument.body as unknown as Element, ...o });
  const o = opener as unknown as Element;
  assert.equal(restoreTarget(o, ctx()), o, 'focus in the closing window');
  assert.equal(restoreTarget(o, ctx({ active: fakeDocument.body as unknown as Element })), o, 'focus on nothing');
  assert.equal(restoreTarget(o, ctx({ active: null })), o);
  assert.equal(restoreTarget(o, ctx({ active: elsewhere as unknown as Element })), null, 'focus moved on already');
  assert.equal(restoreTarget(o, ctx({ inMouseLook: true })), null, 'the Deck takes the mouse back itself');
  assert.equal(restoreTarget(null, ctx()), null);
  opener.remove();
  assert.equal(restoreTarget(o, ctx()), null, 'gone from the page');
});

test('opened from mouse-look on the Deck, closing leaves focus to the Deck', async () => {
  const canvas = new FakeElement('canvas');
  fakeDocument.body.append(canvas);
  canvas.focus();
  fakeDocument.pointerLockElement = canvas;
  const m = openModal(win('Help', h('input', { type: 'text' })));
  fakeDocument.pointerLockElement = null;
  await tick();
  const inside = fakeDocument.activeElement;
  m.close();
  assert.notEqual(fakeDocument.activeElement, canvas, 'not handed back here: input/focus.ts does it');
  assert.notEqual(fakeDocument.activeElement, inside);
});

test('the toasts ride on the top window and go back to their place when the last one closes', () => {
  const toasts = fakeDocument.getElementById('toasts')!;
  const home = toasts.parentNode;
  const a = openModal(win('A'));
  assert.equal(toasts.parentNode, el(a.backdrop));
  const b = openModal(win('B'));
  assert.equal(toasts.parentNode, el(b.backdrop));
  b.close();
  assert.equal(toasts.parentNode, el(a.backdrop), 'down to the next window, not lost with the closed one');
  openModal(h('div.proxy'), { side: true, escCloses: false, closeButton: false });
  assert.equal(toasts.parentNode, el(a.backdrop), 'a side panel is no window to ride on');
  closeAllModals();
  assert.equal(toasts.parentNode, home);
  assert.equal(toasts.nextSibling, root(), 'in the same place as before');
});

test('Tab off the last stop goes round to the first, Shift+Tab off the first to the last', () => {
  const first = h('input', { type: 'text' });
  const skipped = h('button', { tabindex: '-1' }, 'Not a stop');
  const last = h('button', {}, 'Save');
  const m = openModal(win('A', first, skipped, last), { closeButton: false });
  const tab = (shiftKey: boolean) => {
    let prevented = false;
    wrapTab(m.backdrop, { shiftKey, preventDefault: () => (prevented = true) });
    return prevented;
  };
  last.focus();
  assert.equal(tab(false), true);
  assert.equal(fakeDocument.activeElement, el(first));
  assert.equal(tab(true), true);
  assert.equal(fakeDocument.activeElement, el(last));
  first.focus();
  assert.equal(tab(false), false, 'in the middle the browser moves on by itself');
  fakeDocument.body.focus();
  fakeDocument.activeElement = fakeDocument.body;
  assert.equal(tab(false), true, 'from nothing, into the window');
  assert.equal(fakeDocument.activeElement, el(first));
});
