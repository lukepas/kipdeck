// Client races and stale views, on the stand-in DOM (tests/support/fake-dom.ts): the Approval card
// coming back to life after a reconnect when its answer may never have arrived (home/approval.ts),
// Pair a phone closed while its code is on the way (ui/pair.ts), Settings > Agents keeping an open
// permission-mode select through spend updates (ui/settings-spend.ts), the warm gate counting every
// project and owner (home/list.ts needsYouNow), and one confirm dialog per click burst while the
// dialogs' module loads (home/actions.ts).
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeElement, fakeDocument, installFakeDom } from './support/fake-dom.js';
import type { ClientMsg, ServerMsg } from '../src/shared/protocol.js';

installFakeDom();
const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, String(v)), removeItem: (k: string) => void storage.delete(k) },
});
// The QR code's SVG: the stand-in has no namespaces, so an SVG is an element like any other.
(fakeDocument as unknown as { createElementNS: (ns: string, tag: string) => FakeElement }).createElementNS = (_ns, tag) => new FakeElement(tag);

const { store } = await import('../src/client/state/index.js');
const { home } = await import('../src/client/home/state.js');
const { approvalCard } = await import('../src/client/home/approval.js');
const { openPair } = await import('../src/client/ui/pair.js');
const { spendSettings } = await import('../src/client/ui/settings-spend.js');
const { needsYouNow } = await import('../src/client/home/list.js');
const { createActions } = await import('../src/client/home/actions.js');
const { closeAllModals } = await import('../src/client/ui/dom.js');
const lazy = await import('../src/client/home/lazy.js');

/** A socket that records what it sends and lets a test play the server. */
class FakeNet {
  up = true;
  sent: ClientMsg[] = [];
  private handlers: ((m: ServerMsg) => void)[] = [];
  onMessage(fn: (m: ServerMsg) => void) {
    this.handlers.push(fn);
  }
  onStatus() {}
  send(m: ClientMsg) {
    this.sent.push(m);
  }
  /** The server says `m`: the store first, as the page's own dispatch does, then the handlers. A
   * welcome here is only the reconnect's signal, with nothing in it for the store. */
  hear(m: ServerMsg) {
    if (m.t !== 'welcome') store.apply(m);
    for (const fn of this.handlers) fn(m);
  }
}
type AnyNet = Parameters<typeof approvalCard>[0];
const asNet = (n: FakeNet) => n as unknown as AnyNet;

/** Lets loaded modules and their promises settle. */
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};
const fe = (x: unknown) => x as FakeElement;
const click = (el: FakeElement | null) => {
  assert.ok(el, 'the button is there');
  el.dispatchEvent(new Event('click'));
};

test('an approval answered as the socket died gets its buttons back when the list comes again', async () => {
  const net = new FakeNet();
  const card = approvalCard(asNet(net));
  const a = { id: 'ap-1', workerId: 'w1', floor: 'f1', title: 'Run npm test', tool: 'Bash', command: 'npm test', paths: [], risks: [], at: 1 };
  // Something else waits behind it, so the pane stays on this card after the answer.
  const b = { ...a, id: 'ap-2', at: 2 };
  net.hear({ t: 'approvals', items: [a, b] } as ServerMsg);
  const entry = { id: 'w1', floor: 'f1' } as Parameters<typeof card.show>[0];
  assert.equal(card.show(entry), true);
  await lazy.approval();
  await settle();
  const once = () => fe(card.el).querySelector('.ap-once');
  assert.equal(once()?.hasAttribute('disabled'), false);

  // Allow once: sent, and the card waits on the agent.
  click(once());
  await settle();
  assert.deepEqual(net.sent.at(-1), { t: 'approval.answer', id: 'ap-1', decision: 'once' });
  assert.equal(once()?.hasAttribute('disabled'), true);

  // The frame died with the socket. The page reconnects and asks for the open requests again.
  net.hear({ t: 'welcome' } as ServerMsg);
  assert.deepEqual(net.sent.at(-1), { t: 'approvals.get' });
  net.hear({ t: 'approvals', items: [a, b] } as ServerMsg);
  card.show(entry);
  await settle();
  assert.equal(once()?.hasAttribute('disabled'), false, 'still open on the office: the buttons are live again');

  // With the socket down, a press does nothing rather than leaving the card waiting on nothing.
  net.up = false;
  const before = net.sent.length;
  click(once());
  await settle();
  assert.equal(net.sent.length, before);
  assert.equal(once()?.hasAttribute('disabled'), false);
  net.hear({ t: 'approvals', items: [] } as ServerMsg);
  card.show(entry);
});

test('Pair a phone closed while its code is on the way never starts polling for it', async () => {
  installFakeDom();
  const calls: { url: string; signal?: AbortSignal }[] = [];
  let answer!: (r: Response) => void;
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    calls.push({ url: String(url), signal: init?.signal ?? undefined });
    if (String(url) === '/api/pair') return new Promise<Response>((r) => (answer = r));
    return Promise.resolve(new Response(JSON.stringify({ expired: false })));
  }) as typeof fetch;
  mock.timers.enable({ apis: ['setInterval'] });
  try {
    const opened = openPair();
    assert.equal(calls.length, 1);
    closeAllModals();
    assert.equal(calls[0].signal?.aborted, true, 'the request for a code is called off');
    // The office answers anyway (the abort came too late to stop it).
    answer(new Response(JSON.stringify({ id: 'p1', token: 't', expiresAt: Date.now() + 600_000, addresses: [{ base: 'https://office.example', via: 'public', secure: true }], loopbackOnly: false })));
    await opened;
    mock.timers.tick(10_000);
    await settle();
    assert.deepEqual(
      calls.map((c) => c.url),
      ['/api/pair'],
      'no status polls from a closed window',
    );
  } finally {
    mock.timers.reset();
    globalThis.fetch = realFetch;
  }
});

test('the permission-mode selects stay put while spend ticks, and redraw when a mode changes', () => {
  installFakeDom();
  const listeners: [() => void, string[]][] = [];
  const follow = (fn: () => void, ...topics: string[]) => {
    listeners.push([fn, topics]);
    fn();
  };
  const fire = (topic: string) => listeners.filter(([, t]) => t.includes(topic)).forEach(([fn]) => fn());
  store.me = { ...store.me, admin: true };
  store.floors = [{ id: 'f1', name: 'api' }] as typeof store.floors;
  store.spend = { today: 1.23, modes: {} } as unknown as typeof store.spend;
  const net = new FakeNet();
  const [modesRow] = spendSettings(asNet(net), follow as Parameters<typeof spendSettings>[1]);
  fakeDocument.body.append(fe(modesRow));
  const select = () => fe(modesRow).querySelector('select.spend-mode');
  const first = select();
  assert.ok(first);
  first.focus();
  assert.equal(fakeDocument.activeElement, first);
  // A cent more spent: the select someone has open is the same one, still focused.
  store.spend = { ...store.spend!, today: 1.24 };
  fire('spend');
  fire('floors');
  assert.equal(select(), first);
  assert.equal(fakeDocument.activeElement, first);
  // The mode itself changes: the row shows the new one.
  store.spend = { ...store.spend!, modes: { f1: 'auto' } } as typeof store.spend;
  fire('spend');
  assert.notEqual(select(), first);
  store.floors = [];
  store.spend = undefined;
});

test('the warm gate counts agent requests and loose reminders on every project and owner', () => {
  const was = { project: home.project, owner: home.owner };
  home.project = 'f1';
  home.owner = 'mine';
  store.floors = [{ id: 'f1', name: 'a' }, { id: 'f2', name: 'b' }] as typeof store.floors;
  try {
    assert.equal(needsYouNow(), 0);
    // An agent on project B asks the gate to act on another agent; the list is on project A, Mine.
    store.gate = { ...store.gate, proposals: [{ id: 'g1', floor: 'f2', floorName: 'b', by: { id: 'w9', name: 'w9' }, at: 1 }] } as unknown as typeof store.gate;
    assert.equal(needsYouNow(), 1);
    // A loose reminder on project B too.
    store.reminders = [{ key: 'r1', kind: 'approved-unmerged', floor: 'f2', floorName: 'b', text: 'PR #4 is approved', since: 1 }] as typeof store.reminders;
    assert.equal(needsYouNow(), 2);
  } finally {
    store.gate = { ...store.gate, proposals: [] };
    store.reminders = [];
    store.floors = [];
    Object.assign(home, was);
  }
});

test('two clicks on Stop while the dialogs load open one dialog', async () => {
  installFakeDom();
  const g = globalThis as Record<string, unknown>;
  g.requestIdleCallback = () => {};
  g.requestAnimationFrame = () => 0;
  const net = new FakeNet();
  const actions = createActions(asNet(net));
  const e = { id: 'w1', name: 'w1', floor: 'f1', kind: 'agent', task: 'fix the login' } as Parameters<typeof actions.stop>[0];
  actions.stop(e);
  actions.stop(e);
  await lazy.prompt();
  await settle();
  const dialogs = fakeDocument.getElementById('modal-root')!.querySelectorAll('dialog');
  assert.equal(dialogs.length, 1);
  closeAllModals();
  // Once it's loaded, the next Stop opens again.
  actions.stop(e);
  await settle();
  assert.equal(fakeDocument.getElementById('modal-root')!.querySelectorAll('dialog').length, 1);
  closeAllModals();
});
