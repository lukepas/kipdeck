// Proof-of-merge attestations (server/chain/attest.ts): an office PR a person merged is attested once,
// through the outbox, which keeps it across an RPC that's down and a restart; a wrong chain is refused
// before anything is signed; a bot's merge, a fork's PR and a PR the office didn't make earn nothing;
// a revert refers to the original's attestation; an office PR closed unmerged gets outcome 3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MergeProofs, checkChain, revertedPr, rpcProblem, type AttestSdk, type MergeRecord, type ProofFloor } from '../src/server/chain/attest.js';
import { Outbox, backoff } from '../src/server/chain/outbox.js';
import type { AttestFlags } from '../src/server/chain/flags.js';
import type { GhPull } from '../src/shared/protocol.js';

const FLAGS: AttestFlags = { enabled: true, keyFile: '/keys/base-attester.json', rpc: 'https://sepolia.base.org', schema: `0x${'5c'.repeat(32)}`, mode: 'eas' };
const SHA = 'ab'.repeat(20);

const pull = (number: number, extra: Partial<GhPull> = {}): GhPull => ({ number, title: `PR ${number}`, state: 'MERGED', isDraft: false, url: `https://github.com/acme/app/pull/${number}`, author: 'office-bot', labels: [], reviewDecision: '', headRefName: `office/w${number}`, baseRefName: 'main', createdAt: '', updatedAt: '', additions: 1, deletions: 0, checks: 'pass', body: '', closes: [], ...extra });

function fixture(opts: { chainId?: string; mergedBy?: { login: string; id: number; type: string }; closedBy?: { login: string; id: number; type: string }; permission?: string } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'office-pom-'));
  let now = 1_800_000_000_000;
  const sent: { record: MergeRecord; ref?: string }[] = [];
  let failures = 0;
  const attested: { pr: number; text: string; link?: string }[] = [];
  const pulls: GhPull[] = [];
  const sdk: AttestSdk = {
    createAttestor: () => ({
      address: '0x83dAa5252b68D98F25CbB089CCeE4edc7C083403',
      async attest(record, ref) {
        if (failures > 0) {
          failures--;
          throw new Error('fetch failed: sepolia.base.org is down');
        }
        sent.push({ record, ...(ref ? { ref } : {}) });
        const uid = `0x${String(sent.length).padStart(64, '0')}`;
        return { uid, tx: `0x${'ee'.repeat(32)}`, link: `https://base-sepolia.easscan.org/attestation/view/${uid}` };
      },
    }),
    mergedByHashOf: (id) => (id ? `0x${id.toString(16).padStart(64, '0')}` : `0x${'0'.repeat(64)}`),
    readDeployment: () => undefined,
  };
  const chainCalls: string[] = [];
  const fetchImpl = (async (url: string) => {
    chainCalls.push(url);
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: opts.chainId ?? '0x14a34' }));
  }) as unknown as typeof fetch;
  const by = opts.mergedBy ?? { login: 'ana', id: 4242, type: 'User' };
  const gh = async (args: string[]) => {
    if (args[0] === 'pr') return '[]';
    if (args[1].includes('/permission')) return `${opts.permission ?? 'write'}\n`;
    if (args[1].includes('/issues/')) return JSON.stringify({ merged: false, by: opts.closedBy ?? by });
    return JSON.stringify({ merged: true, sha: SHA, by, head: 'acme/app', base: 'acme/app' });
  };
  const floor: ProofFloor = {
    id: 'f1',
    dir,
    pulls: () => pulls,
    officePull: (p) => !p.fork && p.headRefName.startsWith('office/'),
    workers: () => [{ id: 'w7', name: 'Juno', provider: 'codex', pr: { number: 7, url: '' } } as any],
    tasks: () => [],
    repo: async () => 'acme/app',
    attested: (e) => attested.push(e),
  };
  const make = () => new MergeProofs({ dataDir: dir, flags: FLAGS, floor: (id) => (id === 'f1' ? floor : undefined), loadSdk: async () => sdk, gh, fetch: fetchImpl, now: () => now, timer: false, payout: (_f, pr) => (pr === 7 ? { tx: '5'.repeat(88), amount: '25000000', decimals: 6 } : undefined) });
  return { dir, pulls, sent, attested, chainCalls, floor, make, failNext: (n: number) => void (failures = n), tick: (ms: number) => void (now += ms), close: () => rmSync(dir, { recursive: true, force: true }) };
}

test('a merged office PR is attested once, with who merged it, the merge commit, the harness and the bounty payout', async (t) => {
  const f = fixture(); t.after(() => f.close());
  const proofs = f.make();
  f.pulls.push(pull(7, { createdAt: new Date(1_799_996_400_000).toISOString() }));
  proofs.merged(f.floor, 7);
  await new Promise((r) => setImmediate(r));
  await proofs.flush();
  assert.equal(f.sent.length, 1);
  assert.deepEqual(f.sent[0].record, { repo: 'acme/app', pr: 7, mergeSha: SHA, mergedByHash: `0x${(4242).toString(16).padStart(64, '0')}`, harness: 'codex', agentId: 0n, outcome: 1, solanaTx: '5'.repeat(88), mergedAt: 1_800_000_000, openedAt: 1_799_996_400 });
  assert.equal(f.attested.length, 1);
  assert.match(f.attested[0].link!, /^https:\/\/base-sepolia\.easscan\.org\/attestation\/view\/0x/);
  assert.match(f.attested[0].text, /PR #7 merged, by Juno \(codex\)/);
  // Rung again (the PR window, then GitHub's list): still once.
  proofs.merged(f.floor, 7);
  await new Promise((r) => setImmediate(r));
  await proofs.flush();
  assert.equal(f.sent.length, 1);
});

test('the outbox keeps a merge while the RPC is down, and sends it on a later try, even after a restart', async (t) => {
  const f = fixture(); t.after(() => f.close());
  const proofs = f.make();
  f.pulls.push(pull(7));
  f.failNext(2);
  proofs.merged(f.floor, 7);
  await new Promise((r) => setImmediate(r));
  await proofs.flush();
  let [item] = proofs.outbox.pending();
  assert.equal(item.tries, 1);
  assert.match(item.error!, /down/);
  // Not due yet: nothing is tried.
  await proofs.flush();
  assert.equal(proofs.outbox.pending()[0].tries, 1);
  f.tick(backoff(0));
  await proofs.flush();
  assert.equal(proofs.outbox.pending()[0].tries, 2);
  // The office restarts: the outbox is read back from disk and the merge is still owed.
  const again = f.make();
  [item] = again.outbox.pending();
  assert.equal(item.key, 'acme/app#7:1');
  f.tick(backoff(1));
  await again.flush();
  assert.equal(f.sent.length, 1);
  assert.equal(again.outbox.pending().length, 0);
  assert.match(new Outbox(f.dir).get('acme/app#7:1')!.uid!, /^0x0+1$/);
});

test('the chain-id guard refuses a node that is not Base Sepolia, before anything is signed', async (t) => {
  const f = fixture({ chainId: '0x2105' }); t.after(() => f.close());
  const proofs = f.make();
  f.pulls.push(pull(7));
  proofs.merged(f.floor, 7);
  await new Promise((r) => setImmediate(r));
  await proofs.flush();
  assert.equal(f.sent.length, 0);
  assert.match(proofs.outbox.pending()[0].error!, /Refusing to sign: the node is on chain 0x2105, not Base Sepolia/);
  await assert.rejects(checkChain('https://sepolia.base.org', (async () => new Response('{"result":"0x1"}')) as unknown as typeof fetch), /not Base Sepolia/);
  await checkChain('https://sepolia.base.org', (async () => new Response('{"result":"0x14a34"}')) as unknown as typeof fetch);
});

test("a bot's merge, or a merge by someone without write access, earns nothing", async (t) => {
  for (const o of [{ mergedBy: { login: 'merge-bot[bot]', id: 9, type: 'Bot' } }, { permission: 'read' }]) {
    const f = fixture(o); t.after(() => f.close());
    const proofs = f.make();
    f.pulls.push(pull(7));
    proofs.merged(f.floor, 7);
    await new Promise((r) => setImmediate(r));
    await proofs.flush();
    assert.equal(f.sent.length, 0);
    assert.match(new Outbox(f.dir).get('acme/app#7:1')!.skipped!, /not a person with write access/);
  }
});

test("a fork's PR and one the office didn't make are not attested", async (t) => {
  const f = fixture(); t.after(() => f.close());
  const proofs = f.make();
  f.pulls.push(pull(8, { fork: true }), pull(9, { headRefName: 'feature/by-hand' }));
  proofs.merged(f.floor, 8);
  proofs.merged(f.floor, 9);
  await new Promise((r) => setImmediate(r));
  await proofs.flush();
  assert.equal(f.sent.length, 0);
  assert.equal(proofs.outbox.pending().length, 0);
});

test('a revert that merges is a new attestation (outcome 2) referring to the original', async (t) => {
  const f = fixture(); t.after(() => f.close());
  const proofs = f.make();
  f.pulls.push(pull(7));
  proofs.merged(f.floor, 7);
  await new Promise((r) => setImmediate(r));
  await proofs.flush();
  // GitHub's Revert button: a person's branch, "Reverts owner/name#N" in the body.
  f.pulls.push(pull(11, { headRefName: 'revert-7-office/w7', body: 'Reverts acme/app#7' }));
  assert.equal(revertedPr(f.pulls[1], 'acme/app'), 7);
  assert.equal(revertedPr(pull(12, { body: 'Reverts other/repo#7' }), 'acme/app'), undefined);
  proofs.merged(f.floor, 11);
  await new Promise((r) => setImmediate(r));
  await proofs.flush();
  assert.equal(f.sent.length, 2);
  assert.equal(f.sent[1].record.outcome, 2);
  assert.equal(f.sent[1].record.harness, 'codex');
  assert.equal(f.sent[1].ref, `0x${'1'.padStart(64, '0')}`);
});

test('an office PR closed without merging gets outcome 3', async (t) => {
  const f = fixture(); t.after(() => f.close());
  const proofs = f.make();
  f.pulls.push(pull(7, { state: 'OPEN' }));
  await proofs.pulls(f.floor);
  f.pulls[0] = pull(7, { state: 'CLOSED' });
  await proofs.pulls(f.floor);
  await proofs.flush();
  assert.equal(f.sent.length, 1);
  // Who closed it is a person with write access, asked of GitHub: their pseudonym goes in mergedByHash.
  assert.deepEqual([f.sent[0].record.outcome, f.sent[0].record.mergeSha, f.sent[0].record.mergedByHash], [3, '0'.repeat(40), `0x${(4242).toString(16).padStart(64, '0')}`]);
});

test("an office PR closed by a bot, or by someone without write access, earns nothing", async (t) => {
  for (const o of [{ closedBy: { login: 'stale[bot]', id: 77, type: 'Bot' } }, { permission: 'read' }]) {
    const f = fixture(o); t.after(() => f.close());
    const proofs = f.make();
    f.pulls.push(pull(7, { state: 'OPEN' }));
    await proofs.pulls(f.floor);
    f.pulls[0] = pull(7, { state: 'CLOSED' });
    await proofs.pulls(f.floor);
    await proofs.flush();
    assert.equal(f.sent.length, 0);
    assert.match(new Outbox(f.dir).get('acme/app#7:3')!.skipped!, /closed by .*not a person with write access/);
  }
});

test('attestations only go through Base Sepolia\'s public RPCs (or a local node named on the command line)', () => {
  assert.equal(rpcProblem('https://sepolia.base.org'), undefined);
  assert.equal(rpcProblem('https://base-sepolia-rpc.publicnode.com'), undefined);
  assert.equal(rpcProblem('http://127.0.0.1:8545'), undefined);
  assert.match(rpcProblem('https://mainnet.base.org') ?? '', /--attest-rpc/);
  assert.match(rpcProblem('http://10.0.0.5:8545') ?? '', /--attest-rpc/);
});
