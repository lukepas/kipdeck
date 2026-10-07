// Labs (shared/labs.ts, server/labs.ts): every part beyond the inbox off by default, switched by an
// admin or held on from the command line, and what each switch hides while it is off: Proof of
// Merge's routes, its payouts in the review inbox and its menu rows; the Bridge view's ambience.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cleanLabs, defaultLabs, LAB_IDS, LAB_META, labOn, parseLabList } from '../src/shared/labs.js';
import { Labs } from '../src/server/labs.js';
import { loadConfig } from '../src/server/config.js';
import { labsHandlers } from '../src/server/ws/handlers/labs.js';
import { routes } from '../src/server/http/routes/index.js';
import type { Ctx } from '../src/server/office/context.js';
import type { Client } from '../src/server/office/client.js';
import type { ServerMsg } from '../src/shared/protocol.js';

test('every lab is off as the office ships, and each says what it brings back', () => {
  assert.deepEqual(defaultLabs(), { boards: false, bridge: false, ops: false, meetings: false, voice: false, ambience: false, proof: false });
  for (const id of LAB_IDS) {
    assert.ok(LAB_META[id].name && LAB_META[id].what.length > 20, id);
    // Plain ASCII prose: no em or en dashes.
    assert.doesNotMatch(LAB_META[id].what, /[–—]/, id);
  }
  assert.equal(labOn(undefined, 'proof'), false);
});

test('a --labs list names labs, all of them, or something unknown', () => {
  assert.deepEqual(parseLabList('bridge, proof'), { on: ['bridge', 'proof'], unknown: [] });
  assert.deepEqual(parseLabList('ALL').on, [...LAB_IDS]);
  assert.deepEqual(parseLabList('bridge,warp'), { on: ['bridge'], unknown: ['warp'] });
  assert.deepEqual(parseLabList(undefined), { on: [], unknown: [] });
});

test('only known labs and booleans are taken from a file or a browser', () => {
  assert.deepEqual(cleanLabs({ proof: true, bridge: 'yes', warp: true }), { ...defaultLabs(), proof: true });
  assert.deepEqual(cleanLabs('nope'), defaultLabs());
  assert.deepEqual(cleanLabs({ proof: false }, { ...defaultLabs(), proof: true, ops: true }), { ...defaultLabs(), ops: true });
});

test("an admin's switches are kept on disk; the command line's stay on whatever they say", (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ao-labs-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const labs = new Labs(dir, ['ops']);
  assert.deepEqual(labs.state().forced, ['ops']);
  assert.equal(labs.on('ops'), true);
  assert.equal(labs.on('proof'), false);
  assert.deepEqual(labs.set({ proof: true, ops: false }, 'Ana'), ['proof']);
  assert.equal(labs.on('ops'), true, 'held on from the command line');
  const saved = JSON.parse(readFileSync(path.join(dir, 'labs.json'), 'utf8'));
  assert.equal(saved.on.proof, true);
  assert.equal(saved.by, 'Ana');
  // Back after a restart, without the command line's.
  const again = new Labs(dir);
  assert.equal(again.on('proof'), true);
  assert.equal(again.on('ops'), false);
  assert.deepEqual(again.set({ proof: true }, 'Ana'), [], 'nothing changed');
});

test('--labs and AGENT_OFFICE_LABS hold labs on, and a chain flag holds Proof of Merge on', (t) => {
  const home = mkdtempSync(path.join(tmpdir(), 'ao-labs-cfg-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const prev = process.env.AGENT_OFFICE_LABS;
  t.after(() => (prev === undefined ? delete process.env.AGENT_OFFICE_LABS : (process.env.AGENT_OFFICE_LABS = prev)));
  delete process.env.AGENT_OFFICE_LABS;
  const base = ['--home', home, '--password', 'x', '--no-open'];
  assert.deepEqual(loadConfig(base).labs, []);
  assert.deepEqual(loadConfig([...base, '--labs', 'bridge,ops']).labs, ['bridge', 'ops']);
  assert.deepEqual(loadConfig([...base, '--x402']).labs, ['proof']);
  process.env.AGENT_OFFICE_LABS = 'voice';
  assert.deepEqual(loadConfig([...base, '--labs', 'meetings']).labs, ['voice', 'meetings']);
});

test('only an admin switches labs, and everyone hears which are on, without a toast', () => {
  const sent: { to?: string; msg: ServerMsg }[] = [];
  const toasts: string[] = [];
  const warned: string[] = [];
  const labs = new Labs(undefined);
  const ctx = {
    labs,
    meOf: (id?: string) => ({ admin: id === 'admin' }),
    warn: (_c: Client, e: string) => warned.push(e),
    toastAll: (t: string) => toasts.push(t),
    broadcast: (msg: ServerMsg) => sent.push({ msg }),
  } as unknown as Ctx;
  const client = (accountId: string) => ({ accountId, peer: { name: accountId === 'admin' ? 'Ana' : 'Bo' } }) as unknown as Client;
  labsHandlers['labs.set'](ctx, client('member'), { t: 'labs.set', patch: { proof: true } });
  assert.equal(labs.on('proof'), false);
  assert.deepEqual(warned, ['Only admins can switch labs on or off']);
  labsHandlers['labs.set'](ctx, client('admin'), { t: 'labs.set', patch: { proof: true } });
  assert.equal(labs.on('proof'), true);
  assert.deepEqual(toasts, []);
  const last = sent.at(-1)!.msg as Extract<ServerMsg, { t: 'labs' }>;
  assert.equal(last.t, 'labs');
  assert.equal(last.state.on.proof, true);
});

test("Proof of Merge's routes are all behind its lab, and nothing else is", () => {
  const proofPaths = /^\/(pom\b|actions\.json|api\/actions\/|api\/x402|api\/public\/|agents\/)/;
  for (const r of routes) {
    const where = String(r.path ?? r.prefix);
    const wanted = [r.path].flat().concat(r.prefix ?? []).some((p) => typeof p === 'string' && proofPaths.test(p));
    assert.equal(r.lab === 'proof', wanted, `${where}: ${r.lab ?? 'no lab'}`);
  }
  assert.ok(routes.filter((r) => r.lab === 'proof').length >= 8);
});

test('without Proof of Merge, no payout waits in the review inbox or counts toward it', async () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v), removeItem: (k: string) => void storage.delete(k) } });
  const { store } = await import('../src/client/state/index.js');
  store.floors = [{ id: 'f1', name: 'Deck' } as never];
  store.me = { admin: true };
  store.bounties = { f1: { enabled: true, items: [{ issue: 44, amount: '50000000', decimals: 6, symbol: 'USDC', phase: 'awaiting-approval', txs: [{ at: 5 }], claimPr: 9 }] } } as never;
  store.labs = { on: defaultLabs(), forced: [] };
  assert.deepEqual(store.inbox().map((i) => i.action), []);
  assert.equal(store.counts().review, 0);
  store.labs = { on: { ...defaultLabs(), proof: true }, forced: [] };
  assert.deepEqual(store.inbox().map((i) => i.action), ['approve-payout']);
  assert.equal(store.counts().review, 1);
});

test("the Bridge view's menu rows, panes and tabs name their lab", () => {
  const src = (f: string) => readFileSync(path.join(import.meta.dirname, '..', 'src', 'client', f), 'utf8');
  const hud = src('features/hud/index.ts');
  for (const [id, lab] of [['ledger', 'proof'], ['bounties', 'proof'], ['timeline', 'ops'], ['goals', 'ops'], ['services', 'ops'], ['voice', 'voice'], ['share', 'voice'], ['whiteboard', 'meetings']]) {
    assert.match(hud, new RegExp(`id: '${id}',[^\\n]*lab: '${lab}'`), `${id} is behind ${lab}`);
  }
  // The Bounties pane is only built while Proof of Merge is on, and the panes every page shares have no lab's.
  assert.match(src('ui/settings.ts'), /if \(store\.lab\('proof'\)\) \{[^}]*bountySettings[\s\S]*?id: 'bounties'/);
  assert.doesNotMatch(src('ui/settings-core.ts'), /bount|proof|lab\(/i);
  assert.match(src('ui/menu.ts'), /!a\.lab \|\| store\.lab\(a\.lab\)/);
});

test('without Bridge ambience the bridge starts calm, and nothing that tells you about an agent goes quiet', async () => {
  const { calmBridge } = await import('../src/client/features/labs/calm.js');
  const { loadSettings, LIFE_PARTS } = await import('../src/client/state/persist.js');
  const s = loadSettings();
  const calm = calmBridge(s);
  assert.equal(calm.life, 'silent');
  for (const p of LIFE_PARTS) assert.equal(calm.lifeParts[p], false, p);
  assert.deepEqual([calm.voice, calm.celebrations, calm.watch, calm.hands, calm.momentum, calm.turnaround, calm.shipMotion, calm.mix.ambience], ['off', 'off', 'off', 'off', false, false, 'calm', 0]);
  // The alerts, the needs-you sound and notifications are left alone; the saved settings are not touched.
  assert.deepEqual([calm.alerts, calm.needsYouSound, calm.notify, calm.mix.alerts], [s.alerts, s.needsYouSound, s.notify, s.mix.alerts]);
  assert.equal(s.life, 'full');
  assert.equal(calmBridge({ ...s, shipMotion: 'off' }).shipMotion, 'off');
});

test("a lab that's off is off over the socket too: Proof of Merge's, meetings' and voice's messages go nowhere", async () => {
  const { labRefuses, MESSAGE_LAB } = await import('../src/server/ws/labgate.js');
  const labs = new Labs(undefined);
  const warned: string[] = [];
  const ctx = { labs, warn: (_c: Client, e: string) => warned.push(e) } as unknown as Ctx;
  const c = {} as Client;
  for (const t of ['bounty.approve', 'bounty.release.sent', 'bounty.wallet', 'reputation.get', 'showcase.settings']) assert.equal(MESSAGE_LAB.get(t), 'proof', t);
  assert.equal(MESSAGE_LAB.get('meeting.start'), 'meetings');
  assert.equal(labRefuses(ctx, c, 'bounty.approve'), true);
  assert.deepEqual(warned, ['Proof of Merge (testnets) is off. An admin turns it on in Labs.']);
  assert.equal(labRefuses(ctx, c, 'rtc'), true);
  assert.equal(warned.length, 1, 'voice chatter is dropped quietly');
  // The core loop is never gated.
  for (const t of ['inbox.merge', 'worker.spawn', 'term.input', 'changes.diff']) assert.equal(labRefuses(ctx, c, t), false, t);
  labs.set({ proof: true }, 'Ana');
  assert.equal(labRefuses(ctx, c, 'bounty.approve'), false);
});
