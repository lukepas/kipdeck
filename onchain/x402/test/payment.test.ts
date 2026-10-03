import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { MockFacilitator, serveFacilitator } from '../src/facilitator.js';
import { KeyFileError, keyFileAddress, readEvmKey } from '../src/keyfile.js';
import { decodeHeader, encodeHeader, formatAmount, HEADER_REQUIRED, HEADER_SIGNATURE, isMainnet, NETWORKS, parseAmount, type PaymentPayload, type PaymentRequired } from '../src/networks.js';
import { choose, createPayment, PaymentError, payFetch } from '../src/payer.js';

const payer = privateKeyToAccount(generatePrivateKey());
const someoneElse = privateKeyToAccount(generatePrivateKey());
const PAY_TO = '0x209693Bc6afc0C5328bA36FaF03C514EF312287C';
const sepolia = NETWORKS['base-sepolia'];
const now = () => Math.floor(Date.now() / 1000);

const required = (amount = '100000', network: string = sepolia.caip2): PaymentRequired => ({
  x402Version: 2,
  resource: { url: 'https://office.example/api/x402/task' },
  accepts: [{ scheme: 'exact', network: network as `${string}:${string}`, amount, asset: sepolia.usdc.address, payTo: PAY_TO, maxTimeoutSeconds: 300, extra: { name: 'USDC', version: '2' } }],
});
const pay = (r = required(), account = payer) => createPayment(r, r.accepts[0], account);
const req = (payment: PaymentPayload, r = required()) => ({ x402Version: 2, paymentPayload: payment, paymentRequirements: r.accepts[0] });
const auth = (p: PaymentPayload) => (p.payload as { authorization: Record<string, string> }).authorization;

test('a payment signs TransferWithAuthorization for exactly what was asked, with a fresh nonce', async () => {
  const p = await pay();
  assert.equal(p.x402Version, 2);
  assert.equal(auth(p).from, payer.address);
  assert.equal(auth(p).to.toLowerCase(), PAY_TO.toLowerCase());
  assert.equal(auth(p).value, '100000');
  assert.match(auth(p).nonce, /^0x[0-9a-f]{64}$/);
  assert.notEqual(auth(await pay()).nonce, auth(p).nonce);
});

test('the mock facilitator verifies and settles a good payment once', async () => {
  const f = new MockFacilitator();
  const p = await pay();
  assert.deepEqual(await f.verify(req(p)), { isValid: true, payer: payer.address });
  const settled = await f.settle(req(p));
  assert.equal(settled.success, true);
  assert.match(settled.transaction, /^0x[0-9a-f]{64}$/);
  assert.equal(f.settlements.length, 1);
  assert.equal((await f.settle(req(p))).errorReason, 'invalid_transaction_state');
});

test('the mock facilitator turns down forged, raised, misdirected, late and unfunded payments', async () => {
  const reason = async (p: PaymentPayload, f = new MockFacilitator(), r = required()) => (await f.verify(req(p, r))).invalidReason;
  const p = await pay();
  // Someone else's signature, claimed as the payer's.
  const forged = structuredClone(p);
  (forged.payload as { signature: string }).signature = (await pay(required(), someoneElse)).payload.signature as string;
  assert.equal(await reason(forged), 'invalid_exact_evm_payload_signature');
  // The amount raised after signing no longer matches the signature.
  const raised = structuredClone(p);
  auth(raised).value = '100001';
  assert.equal(await reason(raised), 'invalid_exact_evm_payload_signature');
  // Signed for less than asked.
  assert.equal(await reason(await pay(required('1')), new MockFacilitator(), required()), 'invalid_payment_requirements');
  // Expired: the mock's clock is an hour on.
  assert.equal(await reason(p, new MockFacilitator({ now: () => now() + 3600 })), 'invalid_exact_evm_payload_authorization_valid_before');
  assert.equal(await reason(p, new MockFacilitator({ networks: ['eip155:31337'] })), 'invalid_network');
  assert.equal(await reason(p, new MockFacilitator({ balances: { [payer.address]: 99_999n } })), 'insufficient_funds');
  assert.equal((await new MockFacilitator().verify({ ...req(p), x402Version: 1 })).invalidReason, 'invalid_x402_version');
  assert.equal(await reason({ ...p, payload: { ...p.payload, signature: 'nope' } }), 'invalid_payload');
});

test('mainnets are refused everywhere a network is chosen', () => {
  assert.equal(isMainnet('eip155:8453'), true);
  assert.equal(isMainnet('eip155:1'), true);
  assert.equal(isMainnet('eip155:84532'), false);
  assert.equal(isMainnet('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'), true);
  assert.equal(Object.values(NETWORKS).some((n) => isMainnet(n.caip2)), false);
  assert.throws(() => choose(required('1', 'eip155:8453'), { maxAmount: '1', network: 'eip155:8453' }), /mainnet/);
  assert.throws(() => new MockFacilitator({ networks: ['eip155:8453'] }), /testnets only/);
});

test('the payer only pays in its token, on its network, within its limit', () => {
  assert.equal(choose(required('100000'), { maxAmount: '0.10' }).amount, '100000');
  assert.throws(() => choose(required('100001'), { maxAmount: '0.10' }), (e: unknown) => e instanceof PaymentError && /0.100001, more than the 0.10 limit/.test(e.message));
  const otherToken = required();
  otherToken.accepts[0].asset = '0x0000000000000000000000000000000000000001';
  assert.throws(() => choose(otherToken, { maxAmount: '1' }), /no exact payment/);
  assert.equal(choose(otherToken, { maxAmount: '1', asset: '0x0000000000000000000000000000000000000001' }).amount, '100000');
  assert.equal(parseAmount('0.25'), '250000');
  assert.equal(parseAmount('1.0000001'), undefined);
  assert.equal(formatAmount('100000'), '0.10');
});

test('payFetch pays on a 402 and the facilitator settles it', async () => {
  const served = await serveFacilitator(new MockFacilitator());
  try {
    let calls = 0;
    const server = async (_url: string | URL | Request, init?: RequestInit) => {
      calls++;
      const header = new Headers(init?.headers).get(HEADER_SIGNATURE);
      if (!header) return new Response('{}', { status: 402, headers: { [HEADER_REQUIRED]: encodeHeader(required()) } });
      const payment = decodeHeader<PaymentPayload>(header);
      const r = await fetch(`${served.url}/settle`, { method: 'POST', body: JSON.stringify(req(payment)) });
      const settled = await r.json();
      return new Response(JSON.stringify({ ok: settled.success }), { status: settled.success ? 202 : 402, headers: { 'PAYMENT-RESPONSE': encodeHeader(settled) } });
    };
    const out = await payFetch('https://office.example/api/x402/task', { method: 'POST', body: '{}' }, { account: payer, maxAmount: '0.10', fetch: server as typeof fetch });
    assert.equal(calls, 2);
    assert.equal(out.response.status, 202);
    assert.equal(out.settlement?.success, true);
    assert.equal((served.facilitator as MockFacilitator).settlements.length, 1);
  } finally {
    await served.close();
  }
});

test('key files: read by path, 0600 only, and never echoed', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'x402-key-'));
  const key = generatePrivateKey();
  const address = privateKeyToAccount(key).address;
  const file = path.join(dir, 'payer.json');
  writeFileSync(file, JSON.stringify({ address, privateKey: key }), { mode: 0o600 });
  assert.equal(readEvmKey(file).address, address);
  assert.equal(keyFileAddress(file), address);
  chmodSync(file, 0o644);
  assert.throws(() => readEvmKey(file), (e: unknown) => e instanceof KeyFileError && /chmod 600/.test(e.message) && !e.message.includes(key.slice(2)));
  const wrong = path.join(dir, 'wrong.json');
  writeFileSync(wrong, JSON.stringify({ address: someoneElse.address, privateKey: key }), { mode: 0o600 });
  assert.throws(() => readEvmKey(wrong), (e: unknown) => /does not match/.test((e as Error).message) && !(e as Error).message.includes(key.slice(2)));
  const junk = path.join(dir, 'junk');
  writeFileSync(junk, 'not a key', { mode: 0o600 });
  assert.throws(() => readEvmKey(junk), /not a key file/);
  assert.throws(() => readEvmKey('relative/key.json'), /absolute/);
});
