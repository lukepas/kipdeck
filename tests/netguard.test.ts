import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { addressProblem, guardedFetch, guardedLookup, type GuardOptions } from '../src/server/netguard.js';
import { Webhook, webhookProblem } from '../src/server/webhook.js';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');

test('loopback, private, link-local, ULA, metadata and reserved addresses are blocked; public ones are not', () => {
  const blocked = ['127.0.0.1', '127.1.2.3', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.100.100.100', '0.0.0.0', '224.0.0.1', '255.255.255.255', '::1', '::', 'fe80::1', 'fd00:ec2::254', 'fc00::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '64:ff9b::10.0.0.1', '[::1]',
    // Older and tunnelled ways of wrapping an IPv4 address: compatible, translated, 6to4, Teredo.
    '::7f00:1', '::127.0.0.1', '::ffff:0:7f00:1', '2002:7f00:1::', '2002:a9fe:a9fe::1', '2001:0:4136:e378:8000:63bf:3fff:fdd2', '3fff::1'];
  for (const ip of blocked) assert.ok(addressProblem(ip), `${ip} should be blocked`);
  for (const ip of ['8.8.8.8', '1.1.1.1', '140.82.112.3', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) assert.equal(addressProblem(ip), undefined, ip);
  assert.ok(addressProblem('not-an-ip'));
});

test('a name that resolves to a private address, even alongside a public one, is refused at lookup', async () => {
  const lookup = (answers: string[], opts: Partial<GuardOptions> = {}) =>
    new Promise<string>((resolve) => {
      const guard = guardedLookup({ ...opts, resolve: (_h, cb) => cb(null, answers.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))) });
      guard('rebind.test', {}, (err, address) => resolve(err ? `error: ${err.message}` : String(address)));
    });
  assert.equal(await lookup(['93.184.216.34']), '93.184.216.34');
  assert.match(await lookup(['10.0.0.7']), /^error: rebind\.test resolves to a private/);
  assert.match(await lookup(['93.184.216.34', '127.0.0.1']), /^error:/, 'a mix is refused, so round robin never lands on the private one');
  assert.match(await lookup(['169.254.169.254']), /^error:/);
});

/** A server on this machine standing in for the internet, the metadata service and the LAN at once. */
async function fixtureServer(t: { after(fn: () => void): void }) {
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url ?? '');
    if (req.url === '/pic.png') return res.writeHead(200, { 'content-type': 'image/png' }).end(PNG);
    if (req.url === '/to-metadata') return res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' }).end();
    if (req.url === '/to-loopback-v6') return res.writeHead(302, { location: `http://[::1]:${port}/pic.png` }).end();
    if (req.url === '/to-self') return res.writeHead(302, { location: '/pic.png' }).end();
    if (req.url === '/to-file') return res.writeHead(302, { location: 'file:///etc/passwd' }).end();
    if (req.url === '/loop') return res.writeHead(302, { location: '/loop' }).end();
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  t.after(() => server.close());
  return { base: `http://127.0.0.1:${port}`, port, hits };
}

/** A fetch through the guard, as what came back or why it was refused. */
async function get(url: string, opts: GuardOptions = {}): Promise<string> {
  try {
    const res = await guardedFetch(url, { timeoutMs: 5000, redirects: 5 }, opts);
    res.body.resume();
    return `${res.status}`;
  } catch (err) {
    return `error: ${(err as Error).message}`;
  }
}

test('a guarded fetch reaches nothing on this machine or its network', async (t) => {
  const { base, port, hits } = await fixtureServer(t);
  for (const url of [`${base}/pic.png`, `http://localhost:${port}/pic.png`, `http://[::1]:${port}/pic.png`, 'http://169.254.169.254/latest/meta-data/', 'http://10.1.2.3/x.png', `http://0x7f000001:${port}/pic.png`]) {
    assert.match(await get(url), /^error: .*(private|loopback|link-local|reserved|not a public)/i, url);
  }
  assert.deepEqual(hits, [], 'no request ever reached the local server');
});

test('every redirect a guarded fetch follows is checked like the link itself', async (t) => {
  const { base, hits } = await fixtureServer(t);
  // The fixture server plays a public host; everything else on this machine stays blocked.
  const opts: GuardOptions = { allow: (ip) => ip === '127.0.0.1' };
  assert.equal(await get(`${base}/pic.png`, opts), '200');
  assert.equal(await get(`${base}/to-self`, opts), '200', 'a redirect to a public address is followed');
  assert.match(await get(`${base}/to-metadata`, opts), /^error:/);
  assert.match(await get(`${base}/to-loopback-v6`, opts), /^error:/);
  assert.match(await get(`${base}/to-file`, opts), /file links/);
  assert.equal(await get(`${base}/loop`, opts), '302', 'after five redirects it stops following');
  assert.ok(!hits.some((h) => h.includes('meta-data')));
});

test('webhooks are https only, and an http one saved before is dropped when the office starts', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'office-webhook-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.match(webhookProblem(new URL('http://hooks.slack.com/services/x')) ?? '', /https/);
  assert.match(webhookProblem(new URL('https://u:p@hooks.slack.com/services/x')) ?? '', /user name/);
  assert.equal(webhookProblem(new URL('https://hooks.slack.com/services/x')), undefined);
  const hook = new Webhook(dir, () => 'demo', () => {});
  assert.match(hook.set('http://example.com/hook', 'Ada') ?? '', /https/);
  assert.equal(hook.set('https://hooks.slack.com/services/T/B/x7Qe', 'Ada'), undefined);
  assert.equal(hook.state().webhook?.kind, 'slack');
  writeFileSync(path.join(dir, 'webhook.json'), JSON.stringify({ url: 'http://attacker.example/collect', by: 'Mallory', at: 1 }));
  assert.equal(new Webhook(dir, () => 'demo', () => {}).state().webhook, undefined);
});

test('a webhook pointed at this machine or the LAN is never posted to', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'office-webhook-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const errors = t.mock.method(console, 'error', () => {});
  const hook = new Webhook(dir, () => 'demo', () => {});
  assert.equal(hook.set('https://127.0.0.1:9/hooks', 'Ada'), undefined);
  assert.match((await hook.test('Ada')) ?? '', /public internet/);
  assert.equal(hook.set('https://169.254.169.254/latest', 'Ada'), undefined);
  assert.match((await hook.test('Ada')) ?? '', /public internet/);
  assert.equal(errors.mock.callCount(), 2);
  hook.stop();
});
