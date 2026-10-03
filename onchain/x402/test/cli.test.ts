import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { main } from '../src/cli.js';
import { handleMcp, TOOLS } from '../src/mcp.js';
import { decodeHeader, encodeHeader, HEADER_REQUIRED, HEADER_SIGNATURE, NETWORKS, type PaymentPayload, type PaymentRequired } from '../src/networks.js';

const key = generatePrivateKey();
const address = privateKeyToAccount(key).address;
const dir = mkdtempSync(path.join(os.tmpdir(), 'x402-cli-'));
const keyFile = path.join(dir, 'payer.json');
writeFileSync(keyFile, JSON.stringify({ address, privateKey: key }), { mode: 0o600 });
const PAY_TO = '0x209693Bc6afc0C5328bA36FaF03C514EF312287C';

const required: PaymentRequired = {
  x402Version: 2,
  resource: { url: 'https://office.example/api/x402/task' },
  accepts: [{ scheme: 'exact', network: 'eip155:84532', amount: '100000', asset: NETWORKS['base-sepolia'].usdc.address, payTo: PAY_TO, maxTimeoutSeconds: 300, extra: { name: 'USDC', version: '2' } }],
};

/** An office that wants 0.10 for a task, and takes any payment for the right amount. */
function fakeOffice(seen: { body?: unknown; payment?: PaymentPayload }) {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/api/x402')) {
      return Response.json({ x402Version: 2, price: '0.10', accepts: [{ network: 'eip155:84532', label: 'Base Sepolia', asset: required.accepts[0].asset, payTo: PAY_TO, amount: '100000' }], repos: ['acme/app'], harnesses: ['claude'], approval: true, task: `${u}/task`, maxPromptLength: 8000 });
    }
    if (u.endsWith('/status/abc')) return Response.json({ id: 'abc', title: 'Fix it', status: 'awaiting-approval', payment: { payer: address, amount: '0.10', network: 'eip155:84532', transaction: '0x' } });
    seen.body = JSON.parse(String(init?.body));
    const header = new Headers(init?.headers).get(HEADER_SIGNATURE);
    if (!header) return new Response(JSON.stringify(required), { status: 402, headers: { [HEADER_REQUIRED]: encodeHeader(required) } });
    seen.payment = decodeHeader<PaymentPayload>(header);
    return Response.json({ taskId: 'abc', status: 'held', statusUrl: 'https://office.example/api/x402/status/abc' }, { status: 202 });
  }) as typeof fetch;
}

function io(f: typeof fetch, env: Record<string, string> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { env, fetch: f, out: (s: string) => out.push(s), err: (s: string) => err.push(s) } };
}

test('pay reads the key from X402_PAYER_KEY_FILE, pays, and prints the status link', async () => {
  const seen: { body?: unknown; payment?: PaymentPayload } = {};
  const t = io(fakeOffice(seen), { X402_PAYER_KEY_FILE: keyFile });
  assert.equal(await main(['pay', 'https://office.example', '--repo', 'acme/app', '--issue', '7'], t.io), 0);
  assert.deepEqual(seen.body, { repo: 'acme/app', issue: 7 });
  assert.equal((seen.payment?.payload as { authorization: { from: string } }).authorization.from, address);
  assert.deepEqual(t.out, ['https://office.example/api/x402/status/abc']);
  // Nothing printed holds the key.
  assert.ok(![...t.out, ...t.err].some((l) => l.includes(key.slice(2))));
});

test('pay refuses without a key file, a task, or on a mainnet', async () => {
  const f = fakeOffice({});
  assert.equal(await main(['pay', 'https://office.example', '--repo', 'acme/app', '--issue', '7'], io(f).io), 1);
  assert.equal(await main(['pay', 'https://office.example', '--repo', 'acme/app'], io(f, { X402_PAYER_KEY_FILE: keyFile }).io), 2);
  assert.equal(await main(['pay', 'https://office.example', '--repo', 'acme/app', '--issue', '7', '--network', 'base'], io(f, { X402_PAYER_KEY_FILE: keyFile }).io), 2);
  assert.equal(await main(['pay', 'https://office.example', '--repo', 'acme/app', '--issue', '7', '--max', '0.05'], io(f, { X402_PAYER_KEY_FILE: keyFile }).io), 1);
});

test('price, status and address', async () => {
  const t = io(fakeOffice({}), { X402_PAYER_KEY_FILE: keyFile });
  assert.equal(await main(['price', 'https://office.example'], t.io), 0);
  assert.match(t.out[0], /0.10 USDC per task on Base Sepolia/);
  assert.equal(await main(['status', 'https://office.example/api/x402/status/abc'], t.io), 0);
  assert.match(t.out.at(-1)!, /waiting for an office admin/);
  assert.equal(await main(['address'], t.io), 0);
  assert.equal(t.out.at(-1), address);
  assert.equal(await main(['facilitator', '--rpc', 'https://mainnet.base.org', '--chain-id', '8453', '--key-file', keyFile], t.io), 2);
});

test('MCP: hire_worker without a key answers with what the office asks, and pays with one', async () => {
  const list = (await handleMcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { env: {}, fetch: fakeOffice({}) })) as { result: { tools: unknown[] } };
  assert.equal(list.result.tools.length, TOOLS.length);
  const call = (env: Record<string, string>, seen = {}) =>
    handleMcp({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'hire_worker', arguments: { repo: 'acme/app', issue: 3 } } }, { env: { X402_OFFICE_URL: 'https://office.example', ...env }, fetch: fakeOffice(seen) }) as Promise<{ result: { isError?: boolean; structuredContent?: unknown } }>;
  const quote = await call({});
  assert.equal(quote.result.isError, true);
  assert.deepEqual((quote.result.structuredContent as PaymentRequired).accepts, required.accepts);
  const seen: { payment?: PaymentPayload } = {};
  const paid = await call({ X402_PAYER_KEY_FILE: keyFile }, seen);
  assert.equal(paid.result.isError, undefined);
  assert.equal((paid.result.structuredContent as { status: string }).status, 'held');
  assert.ok(seen.payment);
});
