// Proof of Merge bounties in the office (server/bounties.ts) on the escrow SDK's mock: a worker's
// office PR claims a bounty with its owner's wallet, a fork's never does, a bot's merge never pays,
// a person's merge waits for an admin, and the approval pays and writes the timeline. Offline: the
// SDK's sources run on its MockEscrow, and gh is a stand-in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as sdkSrc from '../onchain/solana/sdk/src/index.ts';
import { Bounties } from '../src/server/bounties.js';
import { guardedRpcFetch, type EscrowSdk } from '../src/server/chain/sdk.js';
import { bountyPayouts, reviewInbox } from '../src/shared/review.js';
import { bountiesHandlers } from '../src/server/ws/handlers/bounties.js';
import type { GhPull, ServerMsg } from '../src/shared/protocol.js';

const sdk = sdkSrc as unknown as EscrowSdk;
const REPO = 'webdevcody/agent-office';
const OPERATOR = sdkSrc.mockAddress('operator wallet');
const FUNDER = sdkSrc.mockAddress('funder');

function pull(n: number, o: Partial<GhPull> = {}): GhPull {
  return { number: n, title: `PR ${n}`, state: 'OPEN', isDraft: false, url: '', author: 'bot', labels: [], reviewDecision: '', headRefName: `office/w-${n}`, baseRefName: 'main', createdAt: '', updatedAt: '', additions: 1, deletions: 0, checks: 'pass', body: '', closes: [12], ...o };
}

/** A floor as Bounties sees it, with what its timeline was told. */
function fakeFloor(dir: string) {
  const timeline: { kind: string; e: any }[] = [];
  const floor = {
    id: 'f1',
    dir,
    def: { name: 'Office' },
    github: { pulls: { items: [] as GhPull[] }, issues: { items: [{ number: 12, title: 'Fix the lift', state: 'OPEN' }] }, repoInfo: async () => ({ nameWithOwner: 'WebDevCody/agent-office', methods: [] }) },
    // The office's own rule (Floor.officePull): never a fork's, an office/ branch or a worker's PR.
    officePull: (p: GhPull) => !p.fork && p.headRefName.startsWith('office/'),
    workers: { list: () => [{ id: 'w1', name: 'Ada', pr: { number: 77, url: '' } }], ownerOf: (id: string) => (id === 'w1' ? 'acct1' : undefined) },
    watch: { bounty: (kind: string, e: any) => timeline.push({ kind, e }) },
  };
  return { floor, timeline };
}

/** gh as GitHub would answer about PR 77: merged by `type` with `permission`. */
function ghFor(type: string, permission = 'write', closes = [12], head = REPO) {
  return async (args: string[]) => {
    if (args[0] === 'api' && /pulls\/\d+$/.test(args[1])) return JSON.stringify({ merged: true, sha: 'ab'.repeat(20), by: { login: type === 'Bot' ? 'renovate[bot]' : 'maintainer', id: 4242, type }, head, base: REPO });
    if (args[0] === 'pr') return JSON.stringify(closes);
    if (args[0] === 'api' && /permission$/.test(args[1])) return `${permission}\n`;
    throw new Error(`unexpected gh ${args.join(' ')}`);
  };
}

async function setup(gh = ghFor('User')) {
  const tmp = mkdtempSync(path.join(tmpdir(), 'ao-bounties-'));
  mkdirSync(path.join(tmp, 'project', '.agent-office'), { recursive: true });
  const { floor, timeline } = fakeFloor(path.join(tmp, 'project'));
  const sent: ServerMsg[] = [];
  const toasts: string[] = [];
  let now = 1_800_000_000;
  const mock = new sdkSrc.MockEscrow({ now: () => now });
  const keysRead: string[] = [];
  const b = new Bounties({
    dataDir: tmp,
    floors: () => [floor as any],
    broadcast: (m) => sent.push(m),
    toastFloor: (_f, text) => toasts.push(text),
    loadSdk: async () => sdk,
    escrow: () => mock as any,
    readKey: (file) => {
      keysRead.push(path.basename(file));
      return { publicKey: sdkSrc.mockAddress(path.basename(file)) };
    },
    gh,
  });
  b.settings.set({ enabled: true, backend: 'mock', actionRepos: [REPO] }, 'admin');
  await b.ready();
  keysRead.length = 0;
  const att = sdkSrc.mockAddress('solana-attester.json');
  const app = sdkSrc.mockAddress('solana-approver.json');
  const fund = async (amount: bigint) => {
    if (!(await mock.get({ repo: REPO, issue: 12 }))) await mock.open({ repo: REPO, issue: 12 }, { expiryTs: now + 86_400, attester: att, approver: app }, { publicKey: FUNDER });
    await mock.fund({ repo: REPO, issue: 12 }, amount, { publicKey: FUNDER });
  };
  return { b, floor, timeline, sent, toasts, mock, fund, keysRead, tick: (s: number) => (now += s), cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
}

const item = (b: Bounties, floor: any) => b.state(floor).items.find((x) => x.issue === 12)!;

test("a fork's pull request never claims a bounty, even from an office/ branch closing the issue", async (t) => {
  const s = await setup();
  t.after(s.cleanup);
  s.b.settings.setWallet('acct1', OPERATOR, () => true);
  await s.fund(20_000_000n);
  s.floor.github.pulls.items = [pull(77, { fork: true })];
  await s.b.sync(s.floor as any);
  assert.equal(item(s.b, s.floor).phase, 'open');
  assert.equal((await s.mock.get({ repo: REPO, issue: 12 }))!.state, 'open');
  assert.ok(!s.timeline.some((x) => x.kind === 'bounty-claimed'));
  // The same PR from the repository itself claims it, for its worker's owner's wallet.
  s.floor.github.pulls.items = [pull(77)];
  await s.b.sync(s.floor as any);
  const chain = (await s.mock.get({ repo: REPO, issue: 12 }))!;
  assert.equal(chain.state, 'claimed');
  assert.equal(chain.claimantWallet, OPERATOR);
  const claimed = s.timeline.find((x) => x.kind === 'bounty-claimed')!;
  assert.match(claimed.e.tx, /^mock-tx-\d+$/);
  assert.equal(claimed.e.name, 'Ada');
});

test('with no payout wallet the bounty stays unclaimed and the inbox asks for one', async (t) => {
  const s = await setup();
  t.after(s.cleanup);
  await s.fund(5_000_000n);
  s.floor.github.pulls.items = [pull(77)];
  await s.b.sync(s.floor as any);
  const v = item(s.b, s.floor);
  assert.equal(v.phase, 'open');
  assert.match(v.note!, /set a payout wallet/);
  const [p] = bountyPayouts({ id: 'f1', name: 'Office' }, s.b.state(s.floor as any));
  assert.equal(p.kind, 'wallet');
  const inbox = reviewInbox([], [], undefined, [p]);
  assert.equal(inbox[0].action, 'set-wallet');
});

test('the timeline notes a funding with its transaction', async (t) => {
  const s = await setup();
  t.after(s.cleanup);
  await s.fund(20_000_000n);
  await s.b.sync(s.floor as any);
  const funded = s.timeline.filter((x) => x.kind === 'bounty-funded');
  assert.equal(funded.length, 1);
  assert.match(funded[0].e.tx, /^mock-tx-\d+$/);
  assert.match(funded[0].e.text, /#12's bounty is 20 USDC now \(1 funder\)/);
  // Looking again with nothing new says nothing again.
  await s.b.sync(s.floor as any);
  assert.equal(s.timeline.filter((x) => x.kind === 'bounty-funded').length, 1);
  assert.equal(item(s.b, s.floor).amount, '20000000');
});

test("a bot's merge never releases the bounty, approved or not", async (t) => {
  const s = await setup(ghFor('Bot'));
  t.after(s.cleanup);
  s.b.settings.setWallet('acct1', OPERATOR, () => true);
  await s.fund(20_000_000n);
  s.floor.github.pulls.items = [pull(77)];
  await s.b.sync(s.floor as any);
  s.floor.github.pulls.items = [pull(77, { state: 'MERGED' })];
  await s.b.sync(s.floor as any);
  const v = item(s.b, s.floor);
  assert.equal(v.phase, 'blocked');
  assert.match(v.note!, /a Bot account: only a person's merge pays/);
  const r = await s.b.approve(s.floor as any, 12, 'admin');
  assert.match(r.error!, /Nothing waits for approval/);
  assert.equal(s.mock.balance(OPERATOR), 0n);
  // The approver's key was never read.
  assert.ok(!s.keysRead.includes('solana-approver.json'));
});

test('a merge by someone without write access, or one that does not close the issue, is not paid either', async (t) => {
  for (const gh of [ghFor('User', 'triage'), ghFor('User', 'write', [99])]) {
    const s = await setup(gh);
    t.after(s.cleanup);
    s.b.settings.setWallet('acct1', OPERATOR, () => true);
    await s.fund(1_000_000n);
    s.floor.github.pulls.items = [pull(77)];
    await s.b.sync(s.floor as any);
    s.floor.github.pulls.items = [pull(77, { state: 'MERGED' })];
    await s.b.sync(s.floor as any);
    assert.equal(item(s.b, s.floor).phase, 'blocked');
  }
});

test("a person's merge waits for an admin, whose approval pays the operator and writes the timeline", async (t) => {
  const s = await setup();
  t.after(s.cleanup);
  s.b.settings.setWallet('acct1', OPERATOR, () => true);
  await s.fund(20_000_000n);
  s.floor.github.pulls.items = [pull(77)];
  await s.b.sync(s.floor as any);
  s.floor.github.pulls.items = [pull(77, { state: 'MERGED' })];
  await s.b.sync(s.floor as any);
  const v = item(s.b, s.floor);
  assert.equal(v.phase, 'awaiting-approval');
  assert.equal(v.mergedBy, 'maintainer');
  assert.match(s.toasts.join('\n'), /PR #77 merged: its 20 USDC bounty waits for an admin/);
  // The review inbox's line for it.
  const payouts = bountyPayouts({ id: 'f1', name: 'Office' }, s.b.state(s.floor as any));
  const inbox = reviewInbox([], [], undefined, payouts);
  assert.equal(inbox[0].reason, 'Approve payout of 20.00 USDC to Ada for PR #77');
  assert.equal(inbox[0].action, 'approve-payout');
  assert.equal(s.mock.balance(OPERATOR), 0n);

  const r = await s.b.approve(s.floor as any, 12, 'Grace');
  assert.match(r.sig!, /^mock-tx-\d+$/);
  assert.equal(s.mock.balance(OPERATOR), 20_000_000n);
  assert.deepEqual(s.keysRead, ['solana-approver.json']);
  assert.equal(item(s.b, s.floor).phase, 'released');
  const paid = s.timeline.find((x) => x.kind === 'bounty-paid')!;
  assert.equal(paid.e.tx, r.sig);
  assert.equal(paid.e.pr, 77);
  assert.match(paid.e.text, /Grace approved: paid 20 USDC to Ada for PR #77/);
  const msg = s.sent.find((m) => m.t === 'bounty.paid') as Extract<ServerMsg, { t: 'bounty.paid' }>;
  assert.deepEqual({ issue: msg.issue, pr: msg.pr, amount: msg.amount }, { issue: 12, pr: 77, amount: '20000000' });
  // Once.
  assert.match((await s.b.approve(s.floor as any, 12, 'Grace')).error!, /Nothing waits for approval/);
});

test('an expired bounty is cranked back to its funder', async (t) => {
  const s = await setup();
  t.after(s.cleanup);
  await s.fund(3_000_000n);
  await s.b.sync(s.floor as any);
  assert.match((await s.b.refund(s.floor as any, 12))!, /hasn't expired/);
  s.tick(86_401);
  await s.b.sync(s.floor as any);
  assert.equal(item(s.b, s.floor).phase, 'expired');
  assert.equal(await s.b.refund(s.floor as any, 12), undefined);
  assert.equal(item(s.b, s.floor).phase, 'refunded');
  assert.equal(s.mock.balance(FUNDER), 3_000_000n);
  assert.ok(s.timeline.some((x) => x.kind === 'bounty-refunded' && /^mock-tx-/.test(x.e.tx)));
});

test('funding from the office opens the bounty if needed, and the public Action only serves opted-in repositories', async (t) => {
  const s = await setup();
  t.after(s.cleanup);
  assert.equal((await s.b.prepareFund(s.floor as any, 12, '12.5', 'nope')).error, "That wallet isn't a Solana address");
  assert.match((await s.b.prepareFund(s.floor as any, 12, '-1', FUNDER)).error!, /An amount is a number/);
  assert.deepEqual(await s.b.prepareFund(s.floor as any, 12, '12.5', FUNDER), {});
  assert.equal((await s.mock.get({ repo: REPO, issue: 12 }))!.total, 12_500_000n);
  const g = await s.b.actionGet(REPO, 12, 'https://office.example');
  assert.equal(g.status, 200);
  assert.equal((g.body as any).title, `Fund ${REPO}#12`);
  // Titles stay off unless an admin shows them.
  assert.doesNotMatch((g.body as any).description, /Fix the lift/);
  assert.equal((await s.b.actionGet('someone/else', 12, 'https://office.example')).status, 404);
  assert.equal((await s.b.actionGet(REPO, 99, 'https://office.example')).status, 404);
  // On the mock there's nothing for a wallet to sign.
  assert.equal((await s.b.actionPost(REPO, 12, '5', FUNDER)).status, 400);
});

test('bounties are off until an admin turns them on', async (t) => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'ao-bounties-off-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const b = new Bounties({ dataDir: tmp, floors: () => [], broadcast: () => {}, toastFloor: () => {}, loadSdk: async () => sdk });
  await b.ready();
  assert.equal(b.enabled, false);
  assert.deepEqual(b.state(undefined), { enabled: false, network: 'solana-devnet', items: [], blink: false });
  assert.equal((await b.actionGet(REPO, 1, 'https://x')).status, 404);
  // Devnet needs a program id before it starts.
  b.settings.set({ enabled: true }, 'admin');
  await b.ready();
  assert.match(b.state(undefined).error!, /set the escrow program id/);
});

test("a non-admin's approval is refused before the approver key is anywhere near", async () => {
  let approved = 0;
  const sent: ServerMsg[] = [];
  const warned: string[] = [];
  const floor = { id: 'f1', def: { name: 'Office' } };
  const ctx: any = {
    meOf: () => ({ admin: false }),
    floors: new Map([['f1', floor]]),
    floorOf: () => floor,
    warn: (_c: unknown, e: string) => warned.push(e),
    sendTo: (_c: unknown, m: ServerMsg) => sent.push(m),
    bounties: { approve: async () => (approved++, {}) },
  };
  const c: any = { peer: { name: 'Mallory', floor: 'f1' }, accountId: 'acct2' };
  bountiesHandlers['bounty.approve'](ctx, c, { t: 'bounty.approve', issue: 12, floor: 'f1' });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(approved, 0);
  assert.deepEqual(warned, ['Only admins can approve bounty payouts']);
  assert.deepEqual(sent, [{ t: 'bounty.approved', issue: 12, error: 'Only admins can approve bounty payouts' }]);
  // An admin's goes through to the bounties.
  ctx.meOf = () => ({ admin: true });
  bountiesHandlers['bounty.approve'](ctx, c, { t: 'bounty.approve', issue: 12, floor: 'f1' });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(approved, 1);
  // So are the settings: an admin's only.
  ctx.meOf = () => ({ admin: false });
  let set = 0;
  ctx.bounties.settings = { set: () => set++ };
  bountiesHandlers['bounty.settings'](ctx, c, { t: 'bounty.settings', patch: { enabled: true } });
  assert.equal(set, 0);
});

test("the RPC goes through the network guard, to devnet's public endpoint only", async () => {
  const f = guardedRpcFetch();
  await assert.rejects(f('https://api.mainnet-beta.solana.com', { method: 'POST', body: '{}' }), /only talks to api\.devnet\.solana\.com/);
  await assert.rejects(f('https://evil.example', { method: 'POST', body: '{}' }), /only talks to/);
  // A local validator only when the guard is told to let 127.0.0.1 through (tests), and still refused without that.
  const local = guardedRpcFetch(['127.0.0.1:1']);
  await assert.rejects(local('http://127.0.0.1:1', { method: 'POST', body: '{}' }), /private, local or reserved/);
});

test("TimelineWatch writes bounty events with the transaction's signature, kept across a restart and cleaned", async () => {
  const { Timeline, TimelineWatch } = await import('../src/server/timeline.js');
  const dir = mkdtempSync(path.join(tmpdir(), 'ao-bounty-timeline-'));
  try {
    const t = new Timeline(dir, 'f1');
    const w = new TimelineWatch(t, { goalTitle: () => undefined, officePull: () => true });
    const sig = '5'.repeat(88);
    w.bounty('bounty-paid', { issue: 12, pr: 77, tx: sig, worker: 'w1', name: 'Ada', text: 'paid 20 USDC to Ada for PR #77' });
    w.bounty('bounty-funded', { issue: 12, tx: 'not a signature!', text: 'funded' });
    const back = new Timeline(dir, 'f1').list({ limit: 10 }).events;
    const paid = back.find((e) => e.kind === 'bounty-paid')!;
    assert.deepEqual([paid.issue, paid.pr, paid.tx, paid.name], [12, 77, sig, 'Ada']);
    // Something that isn't a signature never goes on the timeline as one.
    assert.equal(back.find((e) => e.kind === 'bounty-funded')!.tx, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the Action route's headers are the SDK's, and it is rate-limited per address", async () => {
  const { ACTIONS_HEADERS, ACTIONS_PER_MINUTE, allowAction } = await import('../src/server/http/routes/actions.js');
  assert.deepEqual(ACTIONS_HEADERS, sdkSrc.ACTIONS_CORS_HEADERS);
  const now = 5_000_000;
  for (let i = 0; i < ACTIONS_PER_MINUTE; i++) assert.ok(allowAction('203.0.113.9', now));
  assert.equal(allowAction('203.0.113.9', now), false);
  assert.ok(allowAction('203.0.113.10', now), 'another address has its own allowance');
  assert.ok(allowAction('203.0.113.9', now + 60_000), 'and a minute later it may again');
});

test('a local validator is reached only when the guard is told to let loopback through', async (t) => {
  const http = await import('node:http');
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const { id } = JSON.parse(body);
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id, result: 'ok' }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  t.after(() => server.close());
  const { port } = server.address() as { port: number };
  const host = `127.0.0.1:${port}`;
  const f = guardedRpcFetch([host], { allow: (ip) => ip === '127.0.0.1' });
  const res = await f(`http://${host}`, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }) });
  assert.deepEqual(await res.json(), { jsonrpc: '2.0', id: 1, result: 'ok' });
  // The SDK's Rpc on it, through the guard.
  const rpc = new sdkSrc.Rpc(`http://${host}`, f);
  assert.equal(await rpc.call('getHealth', []), 'ok');
});

/** The office's keys, as setup() reads them, and a ref at the office's own bounty address. */
const ATT = sdkSrc.mockAddress('solana-attester.json');
const APP = sdkSrc.mockAddress('solana-approver.json');
const own = (nonce = 0) => ({ repo: REPO, issue: 12, nonce, attester: ATT, approver: APP });

/** Claims PR 77 and merges it, so the bounty waits for an admin. */
async function toApproval(s: Awaited<ReturnType<typeof setup>>) {
  s.b.settings.setWallet('acct1', OPERATOR, () => true);
  await s.fund(20_000_000n);
  s.floor.github.pulls.items = [pull(77)];
  await s.b.sync(s.floor as any);
  s.floor.github.pulls.items = [pull(77, { state: 'MERGED' })];
  await s.b.sync(s.floor as any);
  assert.equal(item(s.b, s.floor).phase, 'awaiting-approval');
}

test("a stranger's bounty on the same issue, with keys of their own, is never shown, funded or followed", async (t) => {
  const s = await setup();
  t.after(s.cleanup);
  const [squatter, accomplice] = [sdkSrc.mockAddress('squatter'), sdkSrc.mockAddress('accomplice')];
  const theirs = { repo: REPO, issue: 12, nonce: 0, attester: squatter, approver: accomplice };
  await s.mock.open(theirs, { expiryTs: 1_800_086_400, attester: squatter, approver: accomplice }, { publicKey: squatter });
  await s.mock.fund(theirs, 1n, { publicKey: squatter });
  await s.b.sync(s.floor as any);
  assert.deepEqual(s.b.state(s.floor as any).items, []);
  // Funding from the office (and so the Blink) opens the office's own bounty, at its own address.
  assert.deepEqual(await s.b.prepareFund(s.floor as any, 12, '7', FUNDER), {});
  const mine = (await s.mock.get(own()))!;
  assert.equal(mine.total, 7_000_000n);
  assert.notEqual(mine.address, (await s.mock.get(theirs))!.address);
  assert.equal((await s.mock.get(theirs))!.total, 1n);
  assert.equal(item(s.b, s.floor).pda, mine.address);
  assert.equal(((await s.b.actionGet(REPO, 12, 'https://office.example')).body as any).description.includes('7 USDC'), true);
});

test('past its expiry a bounty takes no more funds: the next one opens, and the old one is still cranked back', async (t) => {
  const s = await setup();
  t.after(s.cleanup);
  await s.fund(3_000_000n);
  await s.b.sync(s.floor as any);
  s.tick(86_401);
  await s.b.sync(s.floor as any);
  assert.equal(item(s.b, s.floor).phase, 'expired');
  assert.deepEqual(await s.b.prepareFund(s.floor as any, 12, '2', FUNDER), {});
  assert.equal((await s.mock.get(own(1)))!.total, 2_000_000n);
  assert.equal(item(s.b, s.floor).nonce, 1);
  // Nonce 0 expired unrefunded: an admin's refund still sends it back.
  assert.equal(await s.b.refund(s.floor as any, 12), undefined);
  assert.equal((await s.mock.get(own(0)))!.state, 'refunded');
});

test('no funding while a merge waits for approval, from the office or the Blink', async (t) => {
  const s = await setup();
  t.after(s.cleanup);
  await toApproval(s);
  assert.match((await s.b.prepareFund(s.floor as any, 12, '5', FUNDER)).error!, /awaiting approval: nothing more can go in/);
  assert.equal(((await s.b.actionGet(REPO, 12, 'https://office.example')).body as any).disabled, true);
});

test('two admins approving at once pay once, and the bounty ends released', async (t) => {
  const s = await setup();
  t.after(s.cleanup);
  await toApproval(s);
  const [a, b] = await Promise.all([s.b.approve(s.floor as any, 12, 'Grace'), s.b.approve(s.floor as any, 12, 'Ada')]);
  assert.equal([a, b].filter((r) => r.sig).length, 1);
  assert.match([a, b].find((r) => r.error)!.error!, /already being approved|Nothing waits/);
  assert.equal(item(s.b, s.floor).phase, 'released');
  assert.equal(s.mock.balance(OPERATOR), 20_000_000n);
});

test("a payout that never landed (the office stopped mid-way) goes back before an admin instead of sticking at 'paying'", async (t) => {
  const s = await setup();
  t.after(s.cleanup);
  await toApproval(s);
  const store = (s.b as any).store(s.floor);
  store.put({ ...store.get(12), phase: 'paying' });
  await s.b.sync(s.floor as any);
  const v = item(s.b, s.floor);
  assert.equal(v.phase, 'awaiting-approval');
  assert.match(v.note!, /didn't land/);
  assert.match((await s.b.approve(s.floor as any, 12, 'Grace')).sig!, /^mock-tx-/);
});

test('a release that landed without the office seeing it (a confirm timeout, a wallet) is recorded as paid from the chain', async (t) => {
  const s = await setup();
  t.after(s.cleanup);
  await toApproval(s);
  const r = await s.mock.release(own(), { prNumber: 77, mergeSha: 'ab'.repeat(20) }, { publicKey: ATT }, { publicKey: APP });
  await s.b.sync(s.floor as any);
  assert.equal(item(s.b, s.floor).phase, 'released');
  const paid = s.timeline.find((x) => x.kind === 'bounty-paid')!;
  assert.equal(paid.e.tx, r.signature);
  assert.ok(s.sent.some((m) => m.t === 'bounty.paid'));
  assert.equal(s.b.payout('f1', 77)?.tx, undefined, 'a mock signature is not a devnet one');
  assert.equal(s.b.payoutPending('f1', 77), false);
});

test('a second office PR for the issue that merged while the claimed one is still open takes the claim, and is paid', async (t) => {
  const s = await setup();
  t.after(s.cleanup);
  s.b.settings.setWallet('acct1', OPERATOR, () => true);
  s.b.settings.setWallet(undefined, FUNDER, () => true);
  await s.fund(20_000_000n);
  s.floor.github.pulls.items = [pull(77)];
  await s.b.sync(s.floor as any);
  assert.equal((await s.mock.get(own()))!.prNumber, 77);
  // PR 78 (no worker stands for it: the office's wallet) merges first; 77 stays open.
  s.floor.github.pulls.items = [pull(77), pull(78, { state: 'MERGED' })];
  await s.b.sync(s.floor as any);
  assert.equal((await s.mock.get(own()))!.prNumber, 78);
  assert.equal(item(s.b, s.floor).phase, 'awaiting-approval');
  assert.match((await s.b.approve(s.floor as any, 12, 'Grace')).sig!, /^mock-tx-/);
  assert.equal(s.mock.balance(FUNDER), 20_000_000n);
});

test('a GitHub hiccup on the permission check leaves the bounty claimed, to be checked again, never blocked', async (t) => {
  let down = true;
  const ok = ghFor('User');
  const s = await setup(async (args: string[]) => {
    if (down && args[0] === 'api' && /permission$/.test(args[1])) throw new Error('HTTP 502');
    return ok(args);
  });
  t.after(s.cleanup);
  s.b.settings.setWallet('acct1', OPERATOR, () => true);
  await s.fund(20_000_000n);
  s.floor.github.pulls.items = [pull(77)];
  await s.b.sync(s.floor as any);
  s.floor.github.pulls.items = [pull(77, { state: 'MERGED' })];
  await s.b.sync(s.floor as any);
  assert.equal(item(s.b, s.floor).phase, 'claimed');
  assert.match(item(s.b, s.floor).note!, /couldn't check the merge/);
  down = false;
  await s.b.sync(s.floor as any);
  assert.equal(item(s.b, s.floor).phase, 'awaiting-approval');
});

test('a merged PR that has dropped off the board is still approved and paid', async (t) => {
  const s = await setup();
  t.after(s.cleanup);
  await toApproval(s);
  s.floor.github.pulls.items = [];
  assert.match((await s.b.approve(s.floor as any, 12, 'Grace')).sig!, /^mock-tx-/);
  assert.equal(s.mock.balance(OPERATOR), 20_000_000n);
});

test('an admin is warned a day before a payout waiting for approval expires, and the inbox row says how long is left', async (t) => {
  const s = await setup();
  t.after(s.cleanup);
  // A three-day bounty: nothing to warn about when it merges.
  await s.mock.open(own(), { expiryTs: 1_800_000_000 + 3 * 86_400, attester: ATT, approver: APP }, { publicKey: FUNDER });
  await toApproval(s);
  const [row] = bountyPayouts({ id: 'f1', name: 'Office' }, s.b.state(s.floor as any));
  assert.equal(row.expiry, item(s.b, s.floor).expiry);
  assert.ok(!s.toasts.some((x) => /expires in about/.test(x)));
  s.tick(3 * 86_400 - 3 * 3600);
  await s.b.sync(s.floor as any);
  assert.ok(s.toasts.some((x) => /#12's 20 USDC bounty expires in about 3 h: approve the payout for PR #77/.test(x)));
  await s.b.sync(s.floor as any);
  assert.equal(s.toasts.filter((x) => /expires in about/.test(x)).length, 1);
});

test("with an approver wallet no approver key is read: the admin's wallet gets the release the attester signed", async (t) => {
  const s = await setup();
  t.after(s.cleanup);
  const wallet = sdkSrc.mockAddress('admin wallet');
  const prepared: unknown[] = [];
  // The mock standing in for devnet, with what SolanaEscrow adds for a wallet approver.
  (s.mock as any).prepareRelease = async (ref: unknown, params: unknown, att: { publicKey: string }, approver: string) => (prepared.push({ ref, params, att: att.publicKey, approver }), 'BASE64TX');
  s.b.settings.set({ backend: 'solana-devnet', programId: sdkSrc.MOCK_PROGRAM_ID, approverWallet: wallet }, 'admin');
  await s.b.ready();
  s.keysRead.length = 0;
  s.b.settings.setWallet('acct1', OPERATOR, () => true);
  const ref = { repo: REPO, issue: 12, nonce: 0, attester: ATT, approver: wallet };
  await s.mock.open(ref, { expiryTs: 1_800_086_400, attester: ATT, approver: wallet }, { publicKey: FUNDER });
  await s.mock.fund(ref, 9_000_000n, { publicKey: FUNDER });
  s.floor.github.pulls.items = [pull(77)];
  await s.b.sync(s.floor as any);
  s.floor.github.pulls.items = [pull(77, { state: 'MERGED' })];
  await s.b.sync(s.floor as any);
  const r = await s.b.approve(s.floor as any, 12, 'Grace');
  assert.deepEqual([r.tx, r.approver], ['BASE64TX', wallet]);
  assert.equal((prepared[0] as any).approver, wallet);
  assert.ok(!s.keysRead.includes('solana-approver.json'));
  // The wallet signs and sends it; the office reads the payout off the chain.
  await s.mock.release(ref, { prNumber: 77 }, { publicKey: ATT }, { publicKey: wallet });
  await s.b.sync(s.floor as any);
  assert.equal(item(s.b, s.floor).phase, 'released');
  assert.ok(s.timeline.some((x) => x.kind === 'bounty-paid'));
});

test('refunds and a sent release are for admins only', async () => {
  let refunds = 0;
  let syncs = 0;
  const warned: string[] = [];
  const floor = { id: 'f1', def: { name: 'Office' } };
  const ctx: any = { meOf: () => ({ admin: false }), floors: new Map([['f1', floor]]), floorOf: () => floor, warn: (_c: unknown, e: string) => warned.push(e), sendTo: () => {}, bounties: { refund: async () => (refunds++, undefined), sync: async () => void syncs++ } };
  const c: any = { peer: { name: 'Mallory', floor: 'f1' }, accountId: 'acct2' };
  bountiesHandlers['bounty.refund'](ctx, c, { t: 'bounty.refund', issue: 12, floor: 'f1' });
  bountiesHandlers['bounty.release.sent'](ctx, c, { t: 'bounty.release.sent', issue: 12, floor: 'f1' });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual([refunds, syncs], [0, 0]);
  assert.deepEqual(warned, ['Only admins can crank bounty refunds', 'Only admins can approve bounty payouts']);
  ctx.meOf = () => ({ admin: true });
  bountiesHandlers['bounty.refund'](ctx, c, { t: 'bounty.refund', issue: 12, floor: 'f1' });
  bountiesHandlers['bounty.release.sent'](ctx, c, { t: 'bounty.release.sent', issue: 12, floor: 'f1' });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual([refunds, syncs], [1, 1]);
});
