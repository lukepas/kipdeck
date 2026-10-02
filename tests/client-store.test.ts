import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { EMPTY_PLAN } from '../src/shared/floorplan.js';
import type { ServerMsg } from '../src/shared/protocol.js';

// The store keeps the floor you're on in localStorage and times things by performance.now(): stand both
// in, before the store's module makes the store.
const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, String(v)), removeItem: (k: string) => void storage.delete(k) },
});
let clock = 1000;
Object.defineProperty(performance, 'now', { configurable: true, writable: true, value: () => (clock += 10) });

const state = await import('../src/client/state/index.js');
const { store } = state;

const msg = (m: object) => m as ServerMsg;
const peer = (id: string, extra: object = {}) => ({ id, name: id, color: '#fff', look: {}, x: 0, y: 0, z: 0, rotY: 0, moving: false, floor: 'f1', ...extra });
const worker = (id: string, deskId: string, extra: object = {}) => ({ id, deskId, name: id, color: '#fff', kind: 'agent', status: 'working', createdAt: 1, ...extra });
const el = (id: string, version: number) => ({ id, version, versionNonce: 1 });

/** Everything on a floor, as `welcome` and `floor.enter` bring it. */
function floorView(floor: string) {
  return {
    floor,
    project: { name: floor, dir: `/p/${floor}`, agentCmd: 'claude', defaultProvider: 'claude', agentProviders: ['claude'] },
    workers: [worker(`${floor}-w1`, 'desk-1')],
    issues: { items: [], fetchedAt: 1, loading: false },
    pulls: { items: [], fetchedAt: 1, loading: false },
    queue: { tasks: [], maxWorkers: 2 },
    plan: { labels: {}, wing: 1 },
    services: { items: [], port: 4600 },
    whiteboard: { elements: [el('e1', 1)], people: [] },
    meeting: { current: null, past: [] },
  };
}

const welcome = () =>
  msg({
    t: 'welcome',
    you: 'p-a',
    peers: [peer('p-a', { seat: 's1' }), peer('p-b', { seat: 's2' })],
    floors: [{ id: 'f1', name: 'f1' }, { id: 'f2', name: 'f2' }],
    projectsDir: { dir: '~/p', custom: false },
    ice: [],
    chat: [],
    invites: false,
    upgrade: { available: false, phase: 'idle' },
    usage: { total: {}, today: {}, day: 'd', pauseHiring: false },
    limits: { windows: [], at: 1 },
    me: { admin: true },
    notify: {},
    machine: { cpu: 0, cores: 1, memUsed: 0, memTotal: 1, history: [], workers: 1 },
    prompts: { custom: {} },
    leaveOnMerge: { on: false },
    ...floorView('f1'),
  });

/** What a floor you arrive on fires, in order. */
const FLOOR_TOPICS = ['floor', 'project', 'workers', 'issues', 'pulls', 'queue', 'meeting', 'floorPlan', 'services', 'whiteboard', 'drawing'];

/** Every topic, to listen for them all. */
const TOPICS = ['peers', 'workers', 'issues', 'pulls', 'chat', 'project', 'screens', 'team', 'upgrade', 'services', 'floorPlan', 'usage', 'limits', 'queue', 'me', 'accounts', 'signins', 'notify', 'machine', 'floors', 'floor', 'projectsDir', 'repos', 'leaveOnMerge', 'whiteboard', 'drawing', 'meeting', 'prompts'] as const;

/** Every message the store takes in (and one it doesn't), and the topics it fires, in the order it has always fired them. */
const RUN: [ServerMsg, string[]][] = [
  [welcome(), [...FLOOR_TOPICS, 'peers', 'chat', 'upgrade', 'usage', 'limits', 'me', 'notify', 'machine', 'floors', 'projectsDir', 'prompts', 'leaveOnMerge']],
  [msg({ t: 'pong', at: 0, now: 1_000_000 }), []],
  [msg({ t: 'floors', floors: [{ id: 'f1', name: 'f1' }] }), ['floors']],
  [msg({ t: 'projectsDir', state: { dir: '~/q', custom: true } }), ['projectsDir']],
  [msg({ t: 'floor.repos', repos: [] }), ['repos']],
  [msg({ t: 'peer.join', peer: peer('p-c') }), ['peers']],
  [msg({ t: 'peer.update', peer: peer('p-c', { name: 'C' }) }), ['peers']],
  [msg({ t: 'peer.move', id: 'p-c', x: 1, y: 0, z: 1, rotY: 0, moving: true }), []],
  [msg({ t: 'peer.leave', id: 'p-c' }), ['peers']],
  [msg({ t: 'worker.update', worker: worker('w-2', 'desk-2') }), ['workers']],
  [msg({ t: 'screen', workerId: 'w-2', cols: 80, rows: 24, lines: { 0: [['hi', 1, -1, 0]] }, full: true, cursor: [0, 0] }), ['screens']],
  [msg({ t: 'worker.remove', workerId: 'w-2' }), ['workers']],
  [msg({ t: 'gh.issues', state: { items: [], fetchedAt: 2, loading: false } }), ['issues']],
  [msg({ t: 'gh.pulls', state: { items: [], fetchedAt: 2, loading: false } }), ['pulls']],
  [msg({ t: 'team', state: {} }), ['team']],
  [msg({ t: 'me', me: { admin: false } }), ['me']],
  [msg({ t: 'accounts', state: {} }), ['accounts']],
  [msg({ t: 'signins', state: {} }), ['signins']],
  [msg({ t: 'upgrade', state: { available: true, phase: 'idle' } }), ['upgrade']],
  [msg({ t: 'services', state: { items: [], port: 1 } }), ['services']],
  [msg({ t: 'plan', plan: { labels: {}, wing: 2 } }), ['floorPlan']],
  [msg({ t: 'wb.update', elements: [el('e2', 1)] }), ['whiteboard']],
  [msg({ t: 'wb.update', elements: [el('e2', 0)] }), []],
  [msg({ t: 'wb.people', people: ['p-a'] }), ['drawing']],
  [msg({ t: 'usage', state: {} }), ['usage']],
  [msg({ t: 'limits', state: {} }), ['limits']],
  [msg({ t: 'queue', state: { tasks: [], maxWorkers: 1 } }), ['queue']],
  [msg({ t: 'meeting', state: { current: null, past: [] } }), ['meeting']],
  [msg({ t: 'notify', state: {} }), ['notify']],
  [msg({ t: 'machine', state: {} }), ['machine']],
  [msg({ t: 'prompts', state: { custom: {} } }), ['prompts']],
  [msg({ t: 'leaveOnMerge', state: { on: true } }), ['leaveOnMerge']],
  [msg({ t: 'chat', name: 'A', color: '#fff', text: 'hi', at: 1 }), ['chat']],
  [msg({ t: 'toast', text: 'hi', level: 'info' }), []],
  [msg({ t: 'floor.enter', peers: [peer('p-a', { floor: 'f2' })], ...floorView('f2') }), [...FLOOR_TOPICS, 'peers']],
];

test('every message fires the topics it always has, in the same order', () => {
  let fired: string[] = [];
  const offs = TOPICS.map((t) => store.on(t, () => fired.push(t)));
  for (const [m, topics] of RUN) {
    fired = [];
    store.apply(m);
    assert.deepEqual(fired, topics, m.t);
  }
  for (const off of offs) off();
});

test('each message leaves the fields it always has', () => {
  store.apply(welcome());
  assert.equal(store.you, 'p-a');
  assert.equal(store.floor, 'f1');
  assert.deepEqual([...store.workers.keys()], ['f1-w1']);
  assert.equal(storage.get('agent-office.floor'), 'f1');
  // A screen that changes size starts over.
  store.apply(msg({ t: 'screen', workerId: 'f1-w1', cols: 80, rows: 24, lines: { 1: [['a', 1, -1, 0]] }, full: true, cursor: [1, 1] }));
  store.apply(msg({ t: 'screen', workerId: 'f1-w1', cols: 80, rows: 24, lines: { 2: [['b', 1, -1, 0]] }, full: false, cursor: [2, 2] }));
  assert.deepEqual({ ...store.screens.get('f1-w1'), lines: store.screens.get('f1-w1')!.lines.length }, { cols: 80, rows: 24, cursor: [2, 2], version: 3, lines: 3 });
  store.apply(msg({ t: 'screen', workerId: 'f1-w1', cols: 90, rows: 24, lines: {}, full: false, cursor: [0, 0] }));
  assert.equal(store.screens.get('f1-w1')!.version, 5);
  assert.equal(store.screens.get('f1-w1')!.lines.length, 0);
  // The chat keeps the last 200 lines.
  for (let i = 0; i < 205; i++) store.apply(msg({ t: 'chat', name: 'A', color: '#fff', text: `${i}`, at: i }));
  assert.equal(store.chat.length, 200);
  assert.equal(store.chat[0].text, '5');
});

test('a listener sees the store as it was when its topic fired', () => {
  store.apply(welcome());
  const seen: Record<string, unknown> = {};
  const offs = [
    // The floor's topics fire once all of it is in, and the people's once the floor's have.
    store.on('floor', () => (seen.floor = { peers: [...store.peers.keys()], workers: [...store.workers.keys()] })),
    // The workers' and the people's already see the whole floor.
    store.on('peers', () => (seen.peers = { floor: store.floor, workers: [...store.workers.keys()] })),
  ];
  store.apply(msg({ t: 'floor.enter', peers: [peer('p-z', { floor: 'f2' })], ...floorView('f2') }));
  assert.deepEqual(seen.floor, { peers: ['p-z'], workers: ['f2-w1'] });
  store.apply({ ...welcome(), floor: 'f1', workers: [worker('w-9', 'desk-9')] } as ServerMsg);
  assert.deepEqual(seen.peers, { floor: 'f1', workers: ['w-9'] });
  for (const off of offs) off();
});

test('what the browser remembers keeps its keys and shapes', () => {
  state.saveProfile({ name: 'Ann', color: '#fff' });
  assert.deepEqual(JSON.parse(storage.get('agent-office.profile')!), { name: 'Ann', color: '#fff' });
  assert.deepEqual(state.loadProfile(), { name: 'Ann', color: '#fff', look: undefined });
  state.rememberSpot({ floor: 'f1', name: 'F', x: 1, y: 2, z: 3, facing: 4 });
  assert.deepEqual(state.lastSpot(), { floor: 'f1', name: 'F', x: 1, y: 2, z: 3, facing: 4 });
  assert.ok(storage.has('agent-office.spot'));
  const settings = state.loadSettings();
  assert.deepEqual(settings, { view: 'first', volume: 0.7, muted: false, pageTurns: true, pushToTalk: false, notify: true, hud: state.HUD_DEFAULTS, pins: [] });
  // Settings saved by an older office, with keys for things that are gone (the jukebox's volume), still load.
  storage.set('agent-office.settings', JSON.stringify({ volume: 0.4, music: 0.9, musicMuted: true }));
  assert.deepEqual(state.loadSettings(), { ...settings, volume: 0.4 });
  state.saveSettings({ ...settings, volume: 2, view: 'third' });
  assert.equal(state.loadSettings().volume, 1);
  assert.equal(state.loadSettings().view, 'third');
  store.apply(welcome());
  assert.equal(state.lastFloor(), 'f1');
});

test("the store's keys are its state, as window.__office shows them", () => {
  // As the office had them before its store was split into slices: methods and the slices aren't among them.
  assert.deepEqual(Object.keys(store).sort(), ['accounts', 'chat', 'drawing', 'floor', 'floorPlan', 'floors', 'ice', 'invites', 'issues', 'leaveOnMerge', 'limits', 'machine', 'me', 'meeting', 'notify', 'peers', 'profile', 'project', 'projectsDir', 'prompts', 'pulls', 'queue', 'repos', 'screens', 'services', 'signins', 'subs', 'team', 'upgrade', 'usage', 'whiteboard', 'workers', 'you']);
});

test('a new store starts every field where it always has', async () => {
  const { Store } = await import('../src/client/state/store.js');
  const { SLICES } = await import('../src/client/state/slices/index.js');
  const s = new Store(SLICES);
  const { profile, subs, ...rest } = Object.fromEntries(Object.entries(s));
  void subs;
  assert.deepEqual({ name: profile.name, color: profile.color }, { name: 'Guest', color: '#4f86f7' });
  assert.deepEqual(
    JSON.parse(JSON.stringify(rest, (_k, v) => (v instanceof Map ? [...v] : v === undefined ? '<undefined>' : v))),
    {
      you: '', peers: [], workers: [], screens: [], project: null, floors: [], floor: null, projectsDir: { dir: '', custom: false },
      repos: { list: [], loading: false, at: 0 }, issues: { items: [], fetchedAt: 0, loading: true }, pulls: { items: [], fetchedAt: 0, loading: true },
      ice: [], chat: [], invites: false, queue: { tasks: [], maxWorkers: 0 }, me: { admin: false },
      upgrade: { available: false, phase: 'idle' },
      usage: { total: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cost: 0, calls: 0 }, today: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cost: 0, calls: 0 }, day: '', pauseHiring: false },
      limits: { windows: [], at: 0 }, notify: {}, machine: { cpu: 0, cores: 0, memUsed: 0, memTotal: 0, history: [], workers: 0 },
      prompts: { custom: {} }, leaveOnMerge: { on: false },
      meeting: { current: null, past: [] }, floorPlan: EMPTY_PLAN, services: { items: [], port: 4600 },
      whiteboard: [], drawing: [],
      team: null, accounts: null, signins: null,
    },
  );
});

test('every slice in state/slices is registered, once', async () => {
  const { SLICES } = await import('../src/client/state/slices/index.js');
  const core = await import('../src/client/state/core.js');
  assert.equal(new Set(SLICES).size, SLICES.length);
  const dir = path.join(import.meta.dirname, '../src/client/state/slices');
  const slices = [...Object.values(core)];
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'index.ts')) {
    const exported = Object.values(await import(pathToFileURL(path.join(dir, f)).href));
    assert.ok(exported.length, `${f} exports its slice`);
    slices.push(...exported);
  }
  for (const s of slices) assert.equal(SLICES.filter((x) => x === s).length, 1, `a slice of ${Object.keys(s as object).join('/')} is registered once`);
  assert.equal(SLICES.length, slices.length);
});

test("a slice's topics fire in its place in the list; a floor's after the message's own", async () => {
  const { Store } = await import('../src/client/state/store.js');
  const fired: string[] = [];
  const s = new Store([
    { on: { welcome: () => ['a'] }, enter: () => ['a floor'] },
    { on: { welcome: () => ['b'], 'floor.enter': () => ['b'] } },
    { on: { welcome: () => ['c'], toast: () => ['c'] }, enter: () => ['c floor'], methods: { hello: () => 'hi' } },
  ] as never);
  for (const t of ['a', 'a floor', 'b', 'c', 'c floor']) s.on(t as never, () => fired.push(t));
  s.apply(welcome());
  assert.deepEqual(fired, ['a floor', 'c floor', 'a', 'b', 'c']);
  fired.length = 0;
  s.apply(msg({ t: 'floor.enter', peers: [], ...floorView('f2') }));
  assert.deepEqual(fired, ['a floor', 'c floor', 'b']);
  fired.length = 0;
  s.apply(msg({ t: 'toast', text: '', level: 'info' }));
  assert.deepEqual(fired, ['c']);
  assert.equal((s as unknown as { hello(): string }).hello(), 'hi');
  assert.ok(!Object.keys(s).includes('hello'));
});
