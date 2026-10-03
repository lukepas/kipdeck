// The payer end to end against the office's own gateway (src/server/x402 in the office, imported from
// the repository): a viem-signed EIP-3009 payment, verified and settled by the mock facilitator served
// over HTTP on 127.0.0.1 (which really recovers the signature), a 202 with a held task on a real
// office queue, and a payment signed by a key that doesn't hold the money refused with a 402.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { MockFacilitator, serveFacilitator } from '../src/facilitator.js';
import { payForTask, quoteTask, taskStatus } from '../src/office.js';
import { X402Gateway, x402Settings } from '../../../src/server/x402/gateway.js';
import { httpFacilitator } from '../../../src/server/x402/facilitator.js';
import { TaskQueue } from '../../../src/server/queue.js';

const OFFICE_WALLET = '0x2522fAd50CA1e545D8Bd8593763432bAB0dcDe9b';

async function office(t: { after(fn: () => unknown): void }, balances: Record<string, bigint> = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'x402-office-'));
  const facilitator = await serveFacilitator(new MockFacilitator({ balances }));
  const spawned: string[] = [];
  const queue = new TaskQueue(dir, { defaultProvider: 'claude', list: () => [], deskOccupied: () => false, spawn: (_d, _b, prompt) => (spawned.push(prompt), 'no desks in a test'), kill: async () => ({}) }, false, { update() {}, toast() {}, claimIssue: async () => undefined, refreshGitHub() {}, hiringPaused: () => undefined, emptied() {} });
  const settings = x402Settings({ enabled: true, payTo: OFFICE_WALLET, price: '0.10', repos: ['acme/app'], facilitator: facilitator.url });
  if (!settings || typeof settings === 'string') throw new Error(String(settings));
  const gateway = new X402Gateway({
    settings,
    dataDir: dir,
    secret: 'test',
    facilitator: httpFacilitator(settings.facilitator),
    floorOfRepo: async (repo) => (repo === 'acme/app' ? { id: 'f1', queue, providers: ['claude'], promptProblem: async () => undefined } : undefined),
    liveTask: (_f, id) => queue.state().tasks.find((x) => x.id === id),
    toast: () => {},
  });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const body = () => new Promise<string>((resolve) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => resolve(s)); });
    const out = await gateway.handle(req, url, `http://127.0.0.1:${(server.address() as AddressInfo).port}`, '127.0.0.1', body);
    res.writeHead(out.status, { 'content-type': 'application/json', ...out.headers });
    res.end(out.status === 204 ? undefined : JSON.stringify(out.body));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  t.after(async () => {
    queue.shutdown();
    await new Promise((r) => server.close(r));
    server.closeAllConnections();
    await facilitator.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, queue, spawned };
}

test('an agent pays for a task: verified and settled for real by the mock facilitator, held on the office queue', async (t) => {
  const o = await office(t);
  const payer = privateKeyToAccount(generatePrivateKey());
  const quote = await quoteTask(o.url, { repo: 'acme/app', issue: 42 });
  assert.equal(quote.accepts[0].network, 'eip155:84532');
  assert.equal(quote.accepts[0].payTo, OFFICE_WALLET);
  const paid = await payForTask(o.url, { repo: 'acme/app', issue: 42 }, { account: payer, maxAmount: '0.10' });
  assert.equal(paid.status, 'held');
  assert.equal(paid.settlement?.success, true);
  const [task] = o.queue.state().tasks;
  assert.equal(task.held, true);
  assert.equal(task.paid?.payer.toLowerCase(), payer.address.toLowerCase());
  assert.match(task.paid?.tx ?? '', /^0x[0-9a-f]{64}$/);
  assert.deepEqual(o.spawned, [], 'nothing starts before an admin approves it');
  const status = await taskStatus(paid.statusUrl);
  assert.equal(status.status, 'awaiting-approval');
});

test("a payer who can't cover it gets a 402 and nothing goes on the queue", async (t) => {
  const payer = privateKeyToAccount(generatePrivateKey());
  const o = await office(t, { [payer.address]: 1000n });
  await assert.rejects(payForTask(o.url, { repo: 'acme/app', prompt: 'Add a dark mode' }, { account: payer, maxAmount: '0.10' }), /insufficient_funds|402/);
  assert.equal(o.queue.state().tasks.length, 0);
});
