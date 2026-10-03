// Merge-based reputation in the office (server/chain/reputation.ts with chain/attest.ts): a worker's
// identity is registered once and its agent id goes into every attestation; each attested outcome
// gets the ERC-8004 feedback the spec gives it (merged 100, paid, self, reverted 0, closed 30); a
// bot's merge earns no feedback and no identity; a bounty claimed by the PR is waited for; the
// public routes answer with ETags and say nothing when reputation is off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { MergeProofs, PAYOUT_WAIT_MS, type AttestSdk, type MergeRecord, type ProofFloor } from '../src/server/chain/attest.js';
import { backoff } from '../src/server/chain/outbox.js';
import { Reputation, eventsOf, type RepSdk } from '../src/server/chain/reputation.js';
import { ReputationIndex } from '../src/server/chain/rep-index.js';
import { chainFlagsFromEnv, type ChainFlags } from '../src/server/chain/flags.js';
import { Showcase } from '../src/server/showcase/service.js';
import { reputationRoutes } from '../src/server/http/routes/reputation.js';
import type { GhPull } from '../src/shared/protocol.js';

const SHA = 'ab'.repeat(20);
const pull = (number: number, extra: Partial<GhPull> = {}): GhPull => ({ number, title: `PR ${number}`, state: 'MERGED', isDraft: false, url: '', author: 'office-bot', labels: [], reviewDecision: '', headRefName: `office/w${number}`, baseRefName: 'main', createdAt: '2027-01-15T08:00:00Z', updatedAt: '', additions: 1, deletions: 0, checks: 'pass', body: '', closes: [], ...extra });

function flags(dir: string): ChainFlags {
  const f = chainFlagsFromEnv({});
  f.attest = { ...f.attest, enabled: true, repos: ['acme/app'], keyFile: path.join(dir, 'attester.json'), schema: `0x${'5c'.repeat(32)}` };
  f.reputation = { ...f.reputation, enabled: true, registrarKeyFile: path.join(dir, 'registrar.json'), cardBase: 'https://office.example' };
  return f;
}

function fixture(opts: { mergedBy?: { login: string; id: number; type: string }; operatorLogin?: string } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'office-rep-'));
  let now = 1_800_000_000_000;
  const sent: MergeRecord[] = [];
  const registered: string[] = [];
  const uris: [bigint, string][] = [];
  const feedback: { agentId: bigint; value: number; tag1: string; tag2: string; feedbackURI: string; feedbackHash: string }[] = [];
  let failRegister = 0;
  let paid: { tx: string; amount: string; decimals: number } | undefined;
  let pending = false;
  const pulls: GhPull[] = [];
  const attestSdk: AttestSdk = {
    createAttestor: () => ({
      address: '0x83dAa5252b68D98F25CbB089CCeE4edc7C083403',
      async attest(record) {
        sent.push(record);
        const uid = `0x${String(sent.length).padStart(64, '0')}`;
        return { uid, tx: `0x${'ee'.repeat(32)}`, link: `https://base-sepolia.easscan.org/attestation/view/${uid}` };
      },
    }),
    readDeployment: () => undefined,
  };
  let nextId = 1n;
  const repSdk: RepSdk = {
    createRegistry: (o) => ({
      address: o.keyFile.endsWith('registrar.json') ? '0x7c2C45a17A432CF890E514f1AaB67D941ec58314' : '0x83dAa5252b68D98F25CbB089CCeE4edc7C083403',
      async register() {
        if (failRegister > 0) {
          failRegister--;
          throw new Error('fetch failed: sepolia.base.org is down');
        }
        registered.push(o.keyFile);
        return { agentId: nextId++, tx: `0x${'12'.repeat(32)}`, link: '' };
      },
      async registered() {
        return 'missing' as const;
      },
      async setAgentURI(agentId, uri) {
        uris.push([agentId, uri]);
        return { tx: `0x${'34'.repeat(32)}` };
      },
      async giveFeedback(f) {
        feedback.push(f);
        return { tx: `0x${'56'.repeat(32)}`, index: BigInt(feedback.length), link: `https://sepolia.basescan.org/tx/0x${'56'.repeat(32)}` };
      },
    }),
    readDeployment: () => undefined,
    keyFileAddress: (file) => (file.endsWith('registrar.json') ? '0x7c2C45a17A432CF890E514f1AaB67D941ec58314' : '0x83dAa5252b68D98F25CbB089CCeE4edc7C083403'),
    IDENTITY_REGISTRY: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
    REPUTATION_REGISTRY: '0x8004B663056A597Dffe9eCcC1965A193B7388713',
  };
  const chainId = (async () => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x14a34' }))) as unknown as typeof fetch;
  const by = opts.mergedBy ?? { login: 'maintainer-ma', id: 4242, type: 'User' };
  const gh = async (args: string[]) => {
    if (args[0] === 'pr') return '[]';
    if (args[1].includes('/permission')) return 'write';
    if (args[1].includes('/issues/')) return JSON.stringify({ merged: false, by });
    return JSON.stringify({ merged: true, sha: SHA, by, head: 'acme/app', base: 'acme/app' });
  };
  const floor: ProofFloor = {
    id: 'f1',
    dir,
    pulls: () => pulls,
    officePull: (p) => !p.fork && p.headRefName.startsWith('office/'),
    workers: () => [{ id: 'w7', name: 'Backend 1', provider: 'codex', pr: { number: 7, url: '' }, worktree: { path: '', branch: 'office/w8', base: 'main' } } as any],
    tasks: () => [],
    repo: async () => 'acme/app',
    isPublic: async () => true,
    attested: () => {},
    operatorOf: () => ({ name: 'Ana', ...(opts.operatorLogin ? { login: opts.operatorLogin } : {}) }),
  };
  const f = flags(dir);
  let proofs: MergeProofs | undefined;
  const rep = new Reputation({ dataDir: dir, flags: f, attestations: () => proofs?.outbox.all() ?? [], ownerOf: () => 'acct-ana', wallet: (a) => (a === 'acct-ana' ? 'FU7ER8xsCunDEWzFsgwiNRsouuTeGo4myzADf5myCQAz' : undefined), workers: () => [{ id: 'w7', key: 'codex/ana/backend-1' }], loadSdk: async () => repSdk, fetch: chainId, now: () => now, timer: false });
  proofs = new MergeProofs({ dataDir: dir, flags: f.attest, floor: () => floor, loadSdk: async () => attestSdk, gh, fetch: chainId, now: () => now, timer: false, payout: () => paid, payoutPending: () => pending, agentIdFor: (item) => rep.agentIdFor(item), onAttested: (item) => rep.attested(item) });
  const settle = async () => {
    await new Promise((r) => setImmediate(r));
    await proofs!.flush();
    await rep.flush();
  };
  return {
    dir, pulls, sent, registered, uris, feedback, floor, rep, proofs, settle,
    tick: (ms: number) => void (now += ms),
    failRegister: (n: number) => void (failRegister = n),
    pay: (p: typeof paid) => void (paid = p),
    pend: (v: boolean) => void (pending = v),
    close: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test("a worker's identity is registered once, its agent id goes into each attestation, and each merge gets 100 / merge / its harness", async (t) => {
  const f = fixture(); t.after(() => f.close());
  f.pulls.push(pull(7), pull(8));
  f.proofs.merged(f.floor, 7);
  await f.settle();
  f.proofs.merged(f.floor, 8);
  await f.settle();
  assert.equal(f.registered.length, 1);
  assert.deepEqual(f.uris, [[1n, 'https://office.example/agents/1.json']]);
  assert.deepEqual(f.sent.map((r) => r.agentId), [1n, 1n]);
  assert.deepEqual(f.feedback.map((x) => [x.agentId, x.value, x.tag1, x.tag2]), [[1n, 100, 'merge', 'codex'], [1n, 100, 'merge', 'codex']]);
  assert.equal(f.feedback[0].feedbackHash, `0x${'1'.padStart(64, '0')}`);
  assert.match(f.feedback[0].feedbackURI, /^https:\/\/base-sepolia\.easscan\.org\/attestation\/view\/0x/);
  assert.equal(f.rep.identities.get('codex/ana/backend-1')?.agentId, '1');
  // Its record: two external merges, by one maintainer, opened to merged known from GitHub.
  const s = f.rep.state();
  assert.equal(s.agents[0].key, 'codex/ana/backend-1');
  assert.deepEqual(s.agents[0].workers, ['w7']);
  assert.deepEqual([s.agents[0].stats?.merged, s.agents[0].stats?.distinctMaintainers, s.agents[0].stats?.mergeRate], [2, 1, null]);
  assert.equal(s.agents[0].card, 'https://office.example/agents/1.json');
  assert.equal(s.owed, 0);
});

test("a merge by the agent's own operator is a self-merge: tagged self, counted apart", async (t) => {
  const f = fixture({ mergedBy: { login: 'Ana-GH', id: 77, type: 'User' }, operatorLogin: 'ana-gh' }); t.after(() => f.close());
  f.pulls.push(pull(7));
  f.proofs.merged(f.floor, 7);
  await f.settle();
  assert.deepEqual(f.feedback.map((x) => x.tag1), ['self']);
  const stats = f.rep.state().agents[0].stats!;
  assert.deepEqual([stats.merged, stats.selfMerged], [0, 1]);
  // The one who opened the PR on GitHub merging it is a self-merge too.
  const g = fixture({ mergedBy: { login: 'office-bot', id: 78, type: 'User' } }); t.after(() => g.close());
  g.pulls.push(pull(7));
  g.proofs.merged(g.floor, 7);
  await g.settle();
  assert.deepEqual(g.feedback.map((x) => x.tag1), ['self']);
});

test("a bot's merge earns no feedback and no identity", async (t) => {
  const f = fixture({ mergedBy: { login: 'merge-queue[bot]', id: 9, type: 'Bot' } }); t.after(() => f.close());
  f.pulls.push(pull(7));
  f.proofs.merged(f.floor, 7);
  await f.settle();
  assert.deepEqual([f.sent.length, f.registered.length, f.feedback.length], [0, 0, 0]);
  assert.equal(f.rep.events().length, 0);
});

test('a bounty claimed by the PR is waited for, so the attestation carries the payout and the feedback says paid', async (t) => {
  const f = fixture(); t.after(() => f.close());
  f.pulls.push(pull(7));
  f.pend(true);
  f.proofs.merged(f.floor, 7);
  await f.settle();
  assert.equal(f.sent.length, 0);
  assert.match(f.proofs.outbox.pending()[0].error!, /waiting for its bounty to be paid/);
  f.pay({ tx: '5'.repeat(88), amount: '25000000', decimals: 6 });
  f.tick(backoff(0));
  await f.settle();
  assert.equal(f.sent[0].solanaTx, '5'.repeat(88));
  assert.deepEqual(f.feedback.map((x) => [x.value, x.tag1]), [[100, 'paid']]);
  const s = f.rep.state().agents[0].stats!;
  assert.deepEqual([s.usdcEarned, s.bountiesPaid], ['25.00', 1]);
  assert.match(f.rep.events()[0].links.solana!, /^https:\/\/explorer\.solana\.com\/tx\/5+\?cluster=devnet$/);
  // A payout that never comes: after PAYOUT_WAIT_MS the merge is attested without it.
  const g = fixture(); t.after(() => g.close());
  g.pulls.push(pull(7));
  g.pend(true);
  g.proofs.merged(g.floor, 7);
  await g.settle();
  g.tick(PAYOUT_WAIT_MS);
  await g.settle();
  assert.deepEqual([g.sent.length, g.sent[0].solanaTx, g.feedback[0].tag1], [1, '', 'merge']);
});

test('while the registry cannot be reached the attestation waits in its outbox, and nothing is registered twice', async (t) => {
  const f = fixture(); t.after(() => f.close());
  f.pulls.push(pull(7));
  f.failRegister(1);
  f.proofs.merged(f.floor, 7);
  await f.settle();
  assert.equal(f.sent.length, 0);
  assert.match(f.proofs.outbox.pending()[0].error!, /down/);
  f.tick(backoff(0));
  await f.settle();
  assert.deepEqual([f.registered.length, f.sent.length, f.sent[0].agentId], [1, 1, 1n]);
});

test('a revert gets 0 and a close by a person gets 30, on the original agent', async (t) => {
  const f = fixture(); t.after(() => f.close());
  f.pulls.push(pull(7));
  f.proofs.merged(f.floor, 7);
  await f.settle();
  f.pulls.push(pull(11, { headRefName: 'revert-7', body: 'Reverts acme/app#7', author: 'someone' }));
  f.proofs.merged(f.floor, 11);
  await f.settle();
  f.pulls.push(pull(8, { state: 'OPEN' }));
  await f.proofs.pulls(f.floor);
  f.pulls[2] = pull(8, { state: 'CLOSED' });
  await f.proofs.pulls(f.floor);
  await f.settle();
  assert.deepEqual(f.feedback.map((x) => [x.agentId, x.value, x.tag1]), [[1n, 100, 'merge'], [1n, 0, 'merge'], [1n, 30, 'merge']]);
  const events = f.rep.events();
  assert.deepEqual(events.map((e) => [e.outcome, e.pr]), [['merged', 7], ['reverted', 7], ['closed', 8]]);
  assert.deepEqual(eventsOf(f.proofs.outbox.all()).length, 3);
});

test('the agent card names the agent, its wallets and its registration, and nothing private', async (t) => {
  const f = fixture(); t.after(() => f.close());
  f.pulls.push(pull(7));
  f.proofs.merged(f.floor, 7);
  await f.settle();
  const card = (await f.rep.card('1', 'https://office.example')) as Record<string, any>;
  assert.equal(card.type, 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1');
  // The operator is a pseudonym on the card, never their name.
  assert.match(card.name, /^codex\/op-[0-9a-f]{10}\/backend-1$/);
  assert.equal(card.operator, card.name.split('/')[1]);
  assert.doesNotMatch(JSON.stringify(card), /"Ana"|\/ana\/|by ana/i);
  assert.deepEqual(card.registrations, [{ agentId: 1, agentRegistry: 'eip155:84532:0x8004a818bfb912233c491871b3d84c89a494bd9e' }]);
  assert.ok(card.services.some((s: { name: string; endpoint: string }) => s.name === 'payoutWallet' && s.endpoint === 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1:FU7ER8xsCunDEWzFsgwiNRsouuTeGo4myzADf5myCQAz'));
  assert.ok(card.services.some((s: { name: string; endpoint: string }) => s.name === 'agentWallet' && s.endpoint === 'eip155:84532:0x7c2c45a17a432cf890e514f1aab67d941ec58314'));
  assert.match(card.description, /agent-office \(MIT, webdevcody \/ AgentSystemLabs\)/);
  assert.doesNotMatch(JSON.stringify(card), /acme|privateKey/);
  assert.equal(await f.rep.card('99', 'https://office.example'), undefined);
});

test('the registrar and the attester must be different keys', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'office-rep-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const f = flags(dir);
  f.reputation.registrarKeyFile = f.attest.keyFile;
  const same: RepSdk = { createRegistry: () => ({ address: '0xabc', register: async () => ({ agentId: 1n, tx: '', link: '' }), setAgentURI: async () => ({ tx: '' }), giveFeedback: async () => ({ tx: '', index: 1n, link: '' }) }), readDeployment: () => undefined, keyFileAddress: () => '0xabc', IDENTITY_REGISTRY: '0x1', REPUTATION_REGISTRY: '0x2' };
  const rep = new Reputation({ dataDir: dir, flags: f, attestations: () => [], loadSdk: async () => same, fetch: (async () => new Response('{"result":"0x14a34"}')) as unknown as typeof fetch, timer: false });
  await assert.rejects(rep.agentIdFor({ key: 'acme/app#1:1', floor: 'f1', repo: 'acme/app', pr: 1, outcome: 1, harness: 'claude', mergedAt: 1, tries: 0, nextAt: 0 }), /must be different keys/);
});

/** A route request and what the route answered. */
function call(route: { handle(ctx: any, r: any): unknown }, ctx: unknown, url: string, headers: Record<string, string> = {}) {
  const out: { status?: number; headers?: Record<string, string>; body?: any } = {};
  const res = {
    headersSent: false,
    writeHead(status: number, h: Record<string, string>) {
      out.status = status;
      out.headers = h;
      return res;
    },
    end(body?: string) {
      if (body) out.body = JSON.parse(body);
    },
  };
  const u = new URL(url, 'http://office.example');
  return Promise.resolve(route.handle(ctx, { req: { headers }, res, url: u, path: decodeURIComponent(u.pathname) })).then(() => out);
}

test('the public routes: records and the board as JSON with an ETag, a 304 when unchanged, 404 when reputation is off', async (t) => {
  const f = fixture(); t.after(() => f.close());
  f.pulls.push(pull(7));
  f.proofs.merged(f.floor, 7);
  await f.settle();
  // The showcase's repository rules apply to the public routes: acme/app is public here.
  let isPrivate = false;
  const floors = new Map([['f1', { github: { repoInfo: async () => ({ nameWithOwner: 'acme/app', private: isPrivate }) } }]]);
  const showcase = new Showcase({ cfg: { dataDir: f.dir }, floors } as never);
  const ctx = { reputation: f.rep, showcase, floors, cfg: { chain: flags(f.dir), port: 4600, tls: undefined, trustProxy: false }, hosts: { requestHost: () => 'office.example' } };
  const board = await call(reputationRoutes.leaderboard, ctx, '/api/public/leaderboard?by=agent&window=all');
  assert.equal(board.status, 200);
  assert.equal(board.body.rows[0].key, '1');
  assert.equal(board.headers!['access-control-allow-origin'], '*');
  assert.equal(board.headers!['cache-control'], 'public, max-age=60');
  const again = await call(reputationRoutes.leaderboard, ctx, '/api/public/leaderboard?by=agent&window=all', { 'if-none-match': board.headers!.etag });
  assert.equal(again.status, 304);
  assert.equal((await call(reputationRoutes.leaderboard, ctx, '/api/public/leaderboard?by=repo')).status, 400);
  assert.equal((await call(reputationRoutes.leaderboard, ctx, '/api/public/leaderboard?window=forever')).status, 400);
  assert.equal((await call(reputationRoutes.leaderboard, ctx, '/api/public/leaderboard?source=chain')).status, 404);
  const agent = await call(reputationRoutes.agent, ctx, '/api/public/reputation/1');
  assert.deepEqual([agent.status, agent.body.stats.merged, agent.body.events.length, agent.body.events[0].repo], [200, 1, 1, 'acme/app']);
  assert.match(agent.body.agent, /^codex\/op-[0-9a-f]{10}\/backend-1$/);
  assert.match(agent.body.events[0].links.attestation, /easscan/);
  // A private repository's outcomes come without its name or the links that lead to it.
  isPrivate = true;
  const hidden = await call(reputationRoutes.agent, ctx, '/api/public/reputation/1');
  assert.deepEqual([hidden.body.events[0].repo, hidden.body.events[0].links, hidden.body.events[0].uid], ['', {}, undefined]);
  const dsPrivate = await call(reputationRoutes.dataset, ctx, '/api/public/dataset.json');
  assert.doesNotMatch(JSON.stringify(dsPrivate.body.events), /acme|easscan/);
  isPrivate = false;
  assert.equal((await call(reputationRoutes.agent, ctx, '/api/public/reputation/2')).status, 404);
  assert.equal((await call(reputationRoutes.agent, ctx, '/api/public/reputation/..%2Fx')).status, 404);
  const card = await call(reputationRoutes.card, ctx, '/agents/1.json');
  assert.match(card.body.name, /^codex\/op-[0-9a-f]{10}\/backend-1$/);
  assert.equal((await call(reputationRoutes.card, ctx, '/agents/1.json.bak')).status, 404);
  const ds = await call(reputationRoutes.dataset, ctx, '/api/public/dataset.json');
  assert.deepEqual([ds.body.license, ds.body.events.length, ds.body.agents[0].uri], ['CC0-1.0', 1, 'https://office.example/agents/1.json']);
  const off = { ...ctx, reputation: undefined };
  for (const [route, url] of [[reputationRoutes.leaderboard, '/api/public/leaderboard'], [reputationRoutes.agent, '/api/public/reputation/1'], [reputationRoutes.card, '/agents/1.json'], [reputationRoutes.dataset, '/api/public/dataset.json']] as const) {
    assert.equal((await call(route, off, url)).status, 404);
  }
});

test('the background indexer runs onchain/indexer with public addresses only and an empty environment, and its board is served', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'office-rep-index-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const seen: { args: string[]; env: NodeJS.ProcessEnv }[] = [];
  const idx = new ReputationIndex({
    dataDir: dir,
    flags: flags(dir),
    minutes: 10,
    sources: async () => ({ attesters: ['0x83daa5252b68d98f25cbb089ccee4edc7c083403'], registrars: ['0x7c2c45a17a432cf890e514f1aab67d941ec58314'] }),
    timer: false,
    spawn: (_cmd, args, o) => {
      seen.push({ args, env: o.env });
      const out = args[args.indexOf('--out') + 1];
      mkdirSync(out, { recursive: true });
      writeFileSync(path.join(out, 'leaderboard.json'), JSON.stringify({ asOf: 5, boards: [{ window: '30d', by: 'harness', rows: [{ key: 'claude' }] }] }));
      const proc = new EventEmitter() as any;
      setImmediate(() => proc.emit('exit', 0));
      return proc;
    },
  });
  await idx.run();
  assert.equal(idx.last?.ok, true);
  assert.deepEqual(Object.keys(seen[0].env).sort(), ['HOME', 'PATH']);
  assert.ok(seen[0].args.includes('0x83daa5252b68d98f25cbb089ccee4edc7c083403'));
  assert.ok(!seen[0].args.some((a) => /key|\.json$/i.test(a) && !a.endsWith('index.ts')));
  const f = fixture(); t.after(() => f.close());
  const ctx = { reputation: f.rep, reputationIndex: idx, cfg: { chain: flags(f.dir), port: 4600, trustProxy: false }, hosts: { requestHost: () => 'office.example' } };
  const r = await call(reputationRoutes.leaderboard, ctx, '/api/public/leaderboard?source=chain');
  assert.deepEqual([r.status, r.body.source, r.body.rows], [200, 'chain', [{ key: 'claude' }]]);
});
