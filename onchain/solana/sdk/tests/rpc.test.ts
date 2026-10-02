import test from 'node:test';
import assert from 'node:assert/strict';
import { CLUSTERS, DEVNET_GENESIS_HASH, Rpc, RpcError, SolanaEscrow, createEscrow, encodeBase58, keypairFromSeed, redactRpcUrl } from '../src/index.js';

test('an RPC endpoint is shown without the API key a provider puts in it', () => {
  assert.equal(redactRpcUrl('https://api.devnet.solana.com'), 'https://api.devnet.solana.com');
  assert.equal(redactRpcUrl('https://api.devnet.solana.com/'), 'https://api.devnet.solana.com');
  assert.equal(redactRpcUrl('https://devnet.helius-rpc.com/?api-key=SECRET'), 'https://devnet.helius-rpc.com/...');
  assert.equal(redactRpcUrl('https://solana-devnet.g.alchemy.com/v2/SECRET'), 'https://solana-devnet.g.alchemy.com/...');
  assert.equal(redactRpcUrl('https://user:SECRET@rpc.example.com'), 'https://rpc.example.com/...');
  assert.equal(redactRpcUrl('not a url SECRET'), 'the configured RPC endpoint');
});

test("an unreachable RPC's error names it without its key", async () => {
  const down = (async () => {
    throw new TypeError('fetch failed');
  }) as unknown as typeof fetch;
  const rpc = new Rpc('https://devnet.helius-rpc.com/?api-key=SECRET', down);
  await assert.rejects(rpc.blockHeight(), (err: Error) => err instanceof RpcError && /can't reach the Solana RPC at https:\/\/devnet\.helius-rpc\.com\/\.\.\.: fetch failed/.test(err.message) && !err.message.includes('SECRET'));
});

test('an RPC that never answers is given up on, so the office never waits on it forever', async () => {
  const hangs = ((_url: string, init: RequestInit) =>
    new Promise((_ok, fail) => {
      init.signal?.addEventListener('abort', () => fail(init.signal!.reason));
    })) as unknown as typeof fetch;
  const rpc = new Rpc('https://rpc.example.com', hangs, 'confirmed', 20);
  // AbortSignal.timeout's timer doesn't keep a process up by itself; the office's server does.
  const alive = setTimeout(() => {}, 5_000);
  try {
    await assert.rejects(rpc.blockHeight(), /can't reach the Solana RPC at https:\/\/rpc\.example\.com: no answer in 0s/);
  } finally {
    clearTimeout(alive);
  }
});

test('an RPC answering with an HTTP error or something that is not JSON says so', async () => {
  const status = (async () => new Response('busy', { status: 429 })) as unknown as typeof fetch;
  await assert.rejects(new Rpc('https://rpc.example.com', status).blockHeight(), /answered 429 to getBlockHeight/);
  const html = (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch;
  await assert.rejects(new Rpc('https://rpc.example.com', html).blockHeight(), /can't reach the Solana RPC at https:\/\/rpc\.example\.com/);
});

/** An RPC whose every call is answered by `answer`, through the injectable fetch. */
function fakeRpc(url: string, answer: (method: string) => unknown, seen: string[] = []) {
  const f = (async (_u: string, init: RequestInit) => {
    const { method, id } = JSON.parse(String(init.body));
    seen.push(method);
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: answer(method) }), { status: 200 });
  }) as unknown as typeof fetch;
  return new Rpc(url, f);
}

const someone = keypairFromSeed(new Uint8Array(32).fill(7));
const program = encodeBase58(new Uint8Array(32).fill(0x11));

test('the client checks the RPC is devnet by its genesis hash before it signs anything', async () => {
  const seen: string[] = [];
  const mainnetLike = fakeRpc('https://rpc.example.com', (m) => (m === 'getGenesisHash' ? '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d' : null), seen);
  const escrow = new SolanaEscrow({ programId: program, rpc: mainnetLike });
  await assert.rejects(escrow.assertCluster(), /not Solana devnet .*refusing to sign/);
  // A step that would sign stops at the check, before any transaction is built or sent.
  await assert.rejects(escrow.claim({ repo: 'o/r', issue: 1 }, { prNumber: 1, wallet: someone.publicKey }, someone));
  assert.ok(!seen.includes('sendTransaction'));
  const devnet = fakeRpc('https://rpc.example.com', (m) => (m === 'getGenesisHash' ? DEVNET_GENESIS_HASH : null));
  await new SolanaEscrow({ programId: program, rpc: devnet }).assertCluster();
});

test('localnet means a loopback RPC, and there is no mainnet cluster at all', async () => {
  const remote = fakeRpc('https://api.devnet.solana.com', () => null);
  await assert.rejects(new SolanaEscrow({ programId: program, rpc: remote, cluster: 'localnet' }).assertCluster(), /loopback/);
  await new SolanaEscrow({ programId: program, rpc: fakeRpc('http://127.0.0.1:8899', () => null), cluster: 'localnet' }).assertCluster();
  assert.throws(() => new SolanaEscrow({ programId: program, cluster: 'mainnet-beta' as any }), /no mainnet/);
  assert.deepEqual([...CLUSTERS], ['devnet', 'localnet']);
  assert.throws(() => createEscrow({ backend: 'solana-mainnet' as any, programId: program }), /unknown escrow backend/);
});

test('reads go through the fetch the office injects', async () => {
  const seen: string[] = [];
  const rpc = fakeRpc('https://api.devnet.solana.com', () => [], seen);
  const escrow = new SolanaEscrow({ programId: program, rpc });
  assert.deepEqual(await escrow.list('o/r'), []);
  assert.deepEqual(seen, ['getProgramAccounts']);
});
