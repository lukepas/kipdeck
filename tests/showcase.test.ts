// The public showcase (/pom/): the serializer's whitelist and redaction, its settings, the share
// card, the admin-only settings messages, and the routes (public, GET only, off until turned on,
// rate limited, their own strict policy, no cookies). The page itself is tests/showcase-e2e.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { asRepEvents, publicShowcase, visibilityOf, type ShowcaseDoc } from '../src/shared/showcase.js';
import { leaderboard } from '../src/shared/reputation.js';
import { cleanShowcase, ShowcaseSettings } from '../src/server/showcase/settings.js';
import { ogImage, OG_HEIGHT, OG_WIDTH } from '../src/server/showcase/og.js';
import { showcaseContentSecurityPolicy } from '../src/server/csp.js';
import { requestHandler } from '../src/server/http/router.js';
import { showcaseRoutes, SHOWCASE_PER_MINUTE } from '../src/server/http/routes/showcase.js';
import { showcaseHandlers } from '../src/server/ws/handlers/showcase.js';
import type { Ctx } from '../src/server/office/context.js';
import type { Client } from '../src/server/office/client.js';
import { fixtureInput, FIXTURE_NOW, SECRETS } from './support/showcase-fixture.js';

/**
 * Every key the public document may have, by where it sits ('events[]' for each item of a list).
 * A new field goes here on purpose, or the test fails: that is the point.
 */
const ALLOWED: Record<string, readonly string[]> = {
  '': ['schema', 'asOf', 'source', 'network', 'counters', 'live', 'events', 'agents', 'bounties', 'verify', 'credit'],
  network: ['base', 'solana'],
  counters: ['merged', 'usdcPaid', 'paidSymbol', 'maintainers', 'paidWorkers', 'links'],
  'counters.links': ['merged', 'usdcPaid', 'maintainers', 'paidWorkers'],
  live: ['at', 'workers'],
  'live.workers[]': ['name', 'sign', 'color', 'harness', 'state'],
  'events[]': ['agentId', 'harness', 'repo', 'pr', 'title', 'outcome', 'at', 'openedAt', 'mergedAt', 'maintainer', 'self', 'paid', 'links'],
  'events[].paid': ['amount', 'decimals', 'mint', 'symbol'],
  'events[].links': ['attestation', 'feedback', 'solana'],
  'agents[]': ['agentId', 'harness', 'label', 'registered'],
  'bounties[]': ['repo', 'issue', 'title', 'amount', 'decimals', 'symbol', 'expiry', 'fund'],
  'bounties[].fund': ['action', 'blink', 'wallet'],
  verify: ['programId', 'programUrl', 'schemaUid', 'schemaUrl', 'eas', 'identity', 'identityUrl', 'reputation', 'reputationUrl', 'attesters', 'registrars', 'command'],
  credit: ['name', 'author', 'url', 'license'],
};

/** Every key path in `v` that ALLOWED doesn't list. */
function stray(v: unknown, at = ''): string[] {
  if (Array.isArray(v)) return v.flatMap((x) => (x && typeof x === 'object' ? stray(x, `${at}[]`) : []));
  if (!v || typeof v !== 'object') return [];
  const allowed = ALLOWED[at];
  if (!allowed) return [`${at} (an object nobody listed)`];
  return Object.entries(v).flatMap(([k, x]) => (allowed.includes(k) ? stray(x, at ? `${at}.${k}` : k) : [`${at ? `${at}.` : ''}${k}`]));
}

test('the serializer lets out only the whitelisted keys, and nothing the office keeps', () => {
  const doc = publicShowcase(fixtureInput());
  assert.deepEqual(stray(doc), []);
  const text = JSON.stringify(doc);
  for (const s of SECRETS) assert.ok(!text.includes(s), `${s} leaked`);
  // Every link goes to a testnet explorer, the Blink, or the office's own Action.
  for (const url of text.match(/https?:\/\/[^"]+/g) ?? []) assert.match(url, /^https:\/\/(base-sepolia\.easscan\.org|sepolia\.basescan\.org|explorer\.solana\.com\/[^"]*cluster=devnet|dial\.to\/|office\.example\/api\/actions\/fund|github\.com\/AgentSystemLabs\/agent-office$)/, url);
  assert.equal(doc.credit.author, 'webdevcody');
});

test('redaction: public repositories in full, private ones redacted, hidden ones left out of everything', () => {
  const doc = publicShowcase(fixtureInput());
  const text = JSON.stringify(doc);
  assert.ok(!text.includes('acme/secret') && !text.includes('Rotate the billing keys'));
  assert.ok(!text.includes('acme/hidden') && !text.includes('Hidden work'));
  // The hidden repository's merge (PR 12) is in no figure; the private ones count, unnamed.
  assert.ok(!doc.events.some((e) => e.pr === 12));
  const priv = doc.events.filter((e) => e.repo === null);
  assert.deepEqual(priv.map((e) => e.pr).sort(), [10, 11, 9]);
  assert.ok(priv.every((e) => e.title === null));
  // ...and with no links: the attestation's page decodes the repository's name, and the feedback and the payout lead to it.
  assert.ok(priv.every((e) => Object.keys(e.links).length === 0));
  assert.ok(doc.events.some((e) => e.repo && e.links.attestation));
  assert.equal(doc.events.find((e) => e.pr === 5)?.title, 'Fix the login redirect loop');
  assert.equal(doc.counters.merged, 7);
  // A redacted bounty shows, with no repository and no fund link (the Action's URL would name it).
  const b = doc.bounties.find((x) => x.issue === 7)!;
  assert.equal(b.repo, null);
  assert.equal(b.title, null);
  assert.equal(b.fund, undefined);
  assert.equal(doc.bounties.find((x) => x.issue === 41)?.fund?.action, 'https://office.example/api/actions/fund?repo=acme%2Fapp&issue=41');
  assert.equal(doc.bounties.length, 2);
});

test('how a repository shows: the admin\'s choice, else full only when GitHub says public', () => {
  const repos = { 'a/pub': { private: false }, 'a/priv': { private: true } };
  assert.equal(visibilityOf('a/pub', { repos }), 'full');
  assert.equal(visibilityOf('a/priv', { repos }), 'redacted');
  assert.equal(visibilityOf('a/unknown', { repos }), 'redacted');
  assert.equal(visibilityOf('a/priv', { repos, visibility: { 'a/priv': 'full' } }), 'full');
  assert.equal(visibilityOf('a/pub', { repos, visibility: { 'a/pub': 'hidden' } }), 'hidden');
  // Redacted by an admin, even though public.
  const input = fixtureInput();
  const doc = publicShowcase({ ...input, visibility: { 'acme/app': 'redacted' } });
  assert.ok(!JSON.stringify(doc).includes('acme/app'));
});

test('links are rebuilt from ids, never passed through: a local chain or a foreign link gives none', () => {
  const input = fixtureInput();
  const evil = { ...input, events: input.events.map((e) => ({ ...e, links: { feedback: 'https://evil.example/x', attestation: 'javascript:alert(1)' } })) };
  const doc = publicShowcase(evil);
  assert.ok(!JSON.stringify(doc).includes('evil.example') && !JSON.stringify(doc).includes('javascript:'));
  assert.ok(doc.events.every((e) => !e.links.feedback));
  const local = publicShowcase({ ...input, base: 'localnet', solana: 'localnet' });
  assert.ok(local.events.every((e) => !e.links.attestation && !e.links.solana));
  assert.equal(local.counters.links.merged, undefined);
});

test('names and titles are one plain line, cut to length', () => {
  const input = fixtureInput();
  const doc = publicShowcase({ ...input, floor: [{ name: 'A‮B\nC'.padEnd(80, 'x'), color: 'red; background:url(x)', state: 'working' }, { name: 'x', color: '#000000', state: 'bogus' as never }] });
  assert.equal(doc.live?.workers.length, 1);
  assert.ok(!/[‮\n]/.test(doc.live!.workers[0].name));
  assert.ok(doc.live!.workers[0].name.length <= 40);
  assert.equal(doc.live!.workers[0].color, '#6e8fb3');
});

test('the page ranks as the office does: self-merges out unless counted', () => {
  const doc = publicShowcase(fixtureInput());
  const without = leaderboard(asRepEvents(doc.events, false), 'harness').find((s) => s.key === 'codex')!;
  const withSelf = leaderboard(asRepEvents(doc.events, true), 'harness').find((s) => s.key === 'codex')!;
  assert.equal(without.selfMerged, 2);
  assert.equal(without.merged, 1);
  assert.equal(withSelf.merged, 3);
});

test('settings: off by default, choices cleaned, kept through the state-file helpers', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'showcase-settings-'));
  const s = new ShowcaseSettings(dir);
  assert.equal(s.get().enabled, false);
  s.set({ enabled: true, repos: { 'Acme/App': 'full', 'bad repo': 'full', 'a/b': 'nope', 'c/d': 'hidden' } }, 'Ada');
  const again = new ShowcaseSettings(dir).get();
  assert.equal(again.enabled, true);
  assert.deepEqual(again.repos, { 'acme/app': 'full', 'c/d': 'hidden' });
  assert.deepEqual(cleanShowcase({ repos: { 'c/d': null } }, again).repos, { 'acme/app': 'full' });
});

test('the share card is a 1200 x 630 PNG', () => {
  const png = ogImage(publicShowcase(fixtureInput()));
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.readUInt32BE(16), OG_WIDTH);
  assert.equal(png.readUInt32BE(20), OG_HEIGHT);
});

test('only admins see or change the showcase settings', async () => {
  const sent: unknown[] = [];
  const warned: string[] = [];
  let set = 0;
  const ctx = {
    meOf: (id: string | undefined) => ({ admin: id === 'admin' }),
    warn: (_c: Client, e: string) => warned.push(e),
    sendTo: (_c: Client, m: unknown) => sent.push(m),
    toastAll: () => {},
    clients: new Map(),
    showcase: { enabled: false, settings: { set: () => set++ }, invalidate: () => {}, state: async () => ({ enabled: false, repos: {}, known: [] }) },
  } as unknown as Ctx;
  const guest = { accountId: 'someone', peer: { name: 'Guest' } } as unknown as Client;
  showcaseHandlers['showcase.settings'](ctx, guest, { t: 'showcase.settings', patch: { enabled: true } });
  showcaseHandlers['showcase.settings.get'](ctx, guest, { t: 'showcase.settings.get' });
  assert.equal(set, 0);
  assert.equal(warned.length, 2);
  const admin = { accountId: 'admin', peer: { name: 'Ada' } } as unknown as Client;
  showcaseHandlers['showcase.settings'](ctx, admin, { t: 'showcase.settings', patch: { enabled: true } });
  showcaseHandlers['showcase.settings.get'](ctx, admin, { t: 'showcase.settings.get' });
  await new Promise((r) => setImmediate(r));
  assert.equal(set, 1);
  assert.equal(sent.length, 1);
});

/** The /pom/ routes in front of a fake office, a bundle of two files, and fixture data. */
async function office(enabled: boolean) {
  const root = mkdtempSync(path.join(tmpdir(), 'showcase-route-'));
  const publicDir = path.join(root, 'public');
  const bundle = path.join(root, 'showcase');
  mkdirSync(path.join(bundle, 'assets'), { recursive: true });
  writeFileSync(path.join(bundle, 'index.html'), '<!doctype html><meta property="og:image" content="__POM_OG__"><script type="module" src="./assets/app.js"></script>');
  writeFileSync(path.join(bundle, 'assets', 'app.js'), 'export {};');
  let built = 0;
  const doc: ShowcaseDoc = publicShowcase(fixtureInput());
  const ctx = {
    cfg: { trustProxy: false, port: 0, tls: undefined, chain: { reputation: {} } },
    hosts: { hostOk: () => true, requestHost: (req: http.IncomingMessage) => req.headers.host, postOk: () => false },
    services: { lookup: () => undefined },
    auth: { fromRequest: () => undefined, fromAnyCookie: () => undefined },
    publicDir,
    showcase: { enabled, doc: async () => (built++, doc) },
    // Proof of Merge on in Labs: these are its routes.
    labs: { on: () => true },
  } as unknown as Ctx;
  const prev = process.env.AGENT_OFFICE_SHOWCASE_DIR;
  process.env.AGENT_OFFICE_SHOWCASE_DIR = bundle;
  const server = http.createServer(requestHandler(ctx, [showcaseRoutes.page, showcaseRoutes.files]));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return {
    base,
    built: () => built,
    close: async () => {
      if (prev === undefined) delete process.env.AGENT_OFFICE_SHOWCASE_DIR;
      else process.env.AGENT_OFFICE_SHOWCASE_DIR = prev;
      await new Promise((r) => server.close(r));
    },
  };
}

test('the routes: public, GET only, their own strict policy, the data, the card, and no cookies', async (t) => {
  const o = await office(true);
  t.after(o.close);
  const page = await fetch(`${o.base}/pom/`, { headers: { cookie: 'session=whatever' } });
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('content-security-policy'), showcaseContentSecurityPolicy());
  assert.equal(page.headers.get('set-cookie'), null);
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  assert.match(await page.text(), /content="http:\/\/127\.0\.0\.1:\d+\/pom\/og\.png"/);
  const csp = showcaseContentSecurityPolicy();
  for (const part of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "frame-ancestors 'none'", "connect-src 'self' https://sepolia.base.org https://api.devnet.solana.com"]) assert.ok(csp.includes(part), part);
  assert.doesNotMatch(csp, /unsafe/);

  const data = await fetch(`${o.base}/pom/showcase.json`);
  assert.equal(data.status, 200);
  assert.match(data.headers.get('content-type') ?? '', /application\/json/);
  const body = (await data.json()) as ShowcaseDoc;
  assert.equal(body.schema, 'agent-office/showcase@1');
  assert.equal(body.asOf, FIXTURE_NOW);
  const etag = data.headers.get('etag')!;
  assert.equal((await fetch(`${o.base}/pom/showcase.json`, { headers: { 'if-none-match': etag } })).status, 304);

  const og = await fetch(`${o.base}/pom/og.png`);
  assert.equal(og.headers.get('content-type'), 'image/png');
  assert.equal((await fetch(`${o.base}/pom/assets/app.js`)).status, 200);
  for (const p of ['/pom/assets/..%2f..%2f..%2fpackage.json', '/pom/..%2fpublic%2findex.html', '/pom/index.html%00.js']) assert.equal((await fetch(`${o.base}${p}`, { redirect: 'manual' })).status, 404, p);
  assert.equal((await fetch(`${o.base}/pom`, { redirect: 'manual' })).headers.get('location'), '/pom/');

  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    const r = await fetch(`${o.base}/pom/showcase.json`, { method, body: method === 'DELETE' ? undefined : '{}' });
    assert.equal(r.status, 405, method);
    assert.equal(r.headers.get('allow'), 'GET');
  }
});

test('off until an admin turns it on: every /pom/ path is a 404', async (t) => {
  const o = await office(false);
  t.after(o.close);
  for (const p of ['/pom/', '/pom/showcase.json', '/pom/og.png', '/pom/assets/app.js']) assert.equal((await fetch(`${o.base}${p}`)).status, 404, p);
  assert.equal(o.built(), 0);
});

test('rate limited per client address', async (t) => {
  const o = await office(true);
  t.after(o.close);
  let last = 0;
  for (let i = 0; i <= SHOWCASE_PER_MINUTE + 1; i++) last = (await fetch(`${o.base}/pom/assets/app.js`)).status;
  assert.equal(last, 429);
});
