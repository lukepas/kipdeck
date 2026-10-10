import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { dayOf, LAUNCH_DIR, loadData, REPO_DIR, sync } from '../launch/chain/tools/calendar.js';
import { render as renderCounts } from '../launch/chain/tools/counts.js';
import { fields, kitFiles, launchDocs, lintFile, loadChecked, loadCounts, placeholders, unlistedLinks } from '../launch/chain/tools/lint.js';
import { classify, historyOf, whatsNew } from '../launch/chain/tools/whats-new.js';
import { Docs } from '../src/server/docs.js';
import { resolveDocLink } from '../src/shared/docs.js';

// The real launch/chain kit, checked the way a submission would go wrong: a stale calendar or count,
// a field over its limit, a number with no source, a link nobody checked, an address that isn't the
// deployed one, a post that claims what isn't built, landing copy that drifted from /pom/.

const read = (file: string) => readFileSync(path.join(LAUNCH_DIR, file), 'utf8');
const json = (file: string) => JSON.parse(readFileSync(path.join(REPO_DIR, file), 'utf8'));
const git = (...args: string[]) => execFileSync('git', args, { cwd: REPO_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

test('every doc passes the linter, with its numbers sourced and its links checked', () => {
  const docs = launchDocs();
  assert.ok(docs.length >= 20, `found ${docs.length}`);
  const counts = loadCounts();
  const checked = loadChecked();
  const problems = docs.flatMap((f) => [...lintFile(f, read(f), counts).map((i) => `${f}:${i.line}: ${i.message}`), ...unlistedLinks(read(f), checked).map((u) => `${f}: unchecked link ${u}`)]);
  assert.deepEqual(problems, []);
});

test('SUBMIT.md pastes the kit word for word, and every disclosure names the same stamped commit, one on this branch', () => {
  const kit = new Map(fields(read('colosseum-worlds-fair.md')).map((f) => [f.name, f.text]));
  const disclosure = new Map(fields(read('disclosure.md')).map((f) => [f.name, f.text]));
  const submit = fields(read('SUBMIT.md'));
  assert.ok(submit.length >= 10, `SUBMIT.md has ${submit.length} fields`);
  for (const f of submit) {
    const source = kit.get(f.name) ?? disclosure.get(f.name);
    if (source !== undefined) assert.equal(f.text, source, `SUBMIT.md "${f.name}" differs from the kit`);
  }
  assert.equal(kit.get('Prior work disclosure'), disclosure.get('Disclosure (Colosseum)'));
  const stamps = new Set(['colosseum-worlds-fair.md', 'disclosure.md', 'SUBMIT.md'].flatMap((f) => [...read(f).matchAll(/226452e4\.\.([0-9a-f]{8})\b/g)].map((m) => m[1])));
  assert.equal(stamps.size, 1, `stamped commits: ${[...stamps]}`);
  const [sha] = stamps;
  assert.doesNotThrow(() => git('merge-base', '--is-ancestor', sha, 'HEAD'), `${sha} is not on this branch`);
});

test('calendar.ics, the README timeline and counts.json are what their sources generate', () => {
  assert.deepEqual(sync(LAUNCH_DIR, true), [], 'run: npx tsx launch/chain/tools/calendar.ts');
  assert.equal(read('data/counts.json'), renderCounts(), 'run: npx tsx launch/chain/tools/counts.ts');
});

test('every entry points at a file that exists and names its date; every kit has an entry', () => {
  const data = loadData();
  for (const e of data.events) {
    assert.ok(existsSync(path.join(LAUNCH_DIR, e.kit)), `${e.id}: ${e.kit}`);
    if (e.kind === 'deadline' || e.kind === 'result') assert.ok(read(e.kit).includes(dayOf(e)), `${e.kit} never mentions ${e.id} on ${dayOf(e)}`);
  }
  for (const kit of kitFiles()) assert.ok(data.events.some((e) => e.kit === kit), `no calendar entry for ${kit}`);
  for (const e of data.events.filter((x) => x.kind === 'deadline' && x.at)) {
    const kit = read(e.kit);
    assert.ok(kit.includes(e.at!.slice(11, 16)) && /UTC[+-]\d/.test(kit), `${e.kit} does not state ${e.at} with its UTC offset`);
  }
});

test('every day of the ten-day plan has a post, dated and in the calendar', () => {
  const data = loadData();
  for (let d = 2; d <= 11; d++) {
    const day = `2026-10-${String(d).padStart(2, '0')}`;
    const post = read(`posts/${day}.md`);
    assert.match(post, new RegExp(`^Date: ${day}`, 'm'));
    assert.ok(data.events.some((e) => e.kit === 'build-in-public.md' && dayOf(e) === day), `no calendar entry for ${day}`);
    const names = fields(post).map((f) => f.name);
    assert.ok(names.includes('X 1') && names.includes('Farcaster'), `${day}: ${names}`);
  }
});

test('a post marked ready has nothing left to fill in, and every commit it cites is on this branch', () => {
  for (const doc of launchDocs().filter((d) => d.startsWith('posts/'))) {
    const text = read(doc);
    const ready = /^Status: ready$/m.test(text);
    if (ready) assert.deepEqual(placeholders(text), [], `${doc} is ready but has placeholders`);
    const built = /^Built in: (.+)$/m.exec(text)![1];
    for (const sha of built.match(/\b[0-9a-f]{7,40}\b/g) ?? []) assert.doesNotThrow(() => git('merge-base', '--is-ancestor', sha, 'HEAD'), `${doc}: ${sha} is not on this branch`);
    if (ready) assert.ok((built.match(/\b[0-9a-f]{7,40}\b/g) ?? []).length > 0, `${doc} is ready but names no commit`);
  }
});

test('the addresses and transactions in the kit are the deployed ones', () => {
  const solana = json('onchain/solana/deployments/devnet.json');
  const attest = json('onchain/attest/deployments/base-sepolia.json');
  const rep = json('onchain/reputation/deployments/base-sepolia.json');
  const kit = read('colosseum-worlds-fair.md');
  const readme = read('README.md');
  const release = solana.e2e.at(-1).signatures.release;
  for (const text of [kit, readme]) {
    for (const want of [solana.programId, release, attest.schemaUid, attest.registerTx, attest.mergeAttestor, rep.identity, rep.reputation]) assert.ok(text.includes(want), `missing ${want}`);
  }
  assert.ok(readme.includes(rep.registrar) && readme.includes(attest.attester), 'the wallets to fund are named');
  assert.equal(solana.cluster, 'devnet');
  assert.equal(attest.chainId, 84532);
});

test('the disclosure is true to git: the snapshot imports, the upstream PRs re-committed in our history, our first commit date', () => {
  const data = loadData();
  const { ours, upstream, imports } = classify(whatsNew(REPO_DIR, data.upstream.baseline).commits, historyOf(data));
  assert.ok(ours.length > 0);
  assert.equal(upstream.length, data.upstream.carried!.length, 'every listed upstream PR is in the range');
  assert.equal(imports.length + 1, data.upstream.imports!.length, 'the other import is the baseline itself');
  for (const i of data.upstream.imports!) assert.doesNotThrow(() => git('merge-base', '--is-ancestor', i.sha, 'HEAD'), `${i.sha} is not on this branch`);
  const first = ours.map((c) => c.date).sort()[0];
  for (const file of ['disclosure.md', 'colosseum-worlds-fair.md']) {
    const text = read(file);
    assert.ok(text.includes(`${upstream.length} upstream pull requests`), `${file} should say ${upstream.length} upstream pull requests`);
    assert.ok(text.includes(`our first commit is ${first}`), `${file} should say our first commit is ${first}`);
    assert.ok(text.includes(data.upstream.baseline.slice(0, 8)), `${file} should name the baseline ${data.upstream.baseline.slice(0, 8)}`);
    assert.ok(!/\brebased\b/.test(text), `${file} says the branch is rebased on upstream; it is not`);
  }
  const disclosure = read('disclosure.md');
  for (const i of data.upstream.imports!) assert.ok(disclosure.includes(i.sha.slice(0, 8)) && disclosure.includes(i.upstream.slice(0, 7)), `disclosure.md should name the import ${i.sha.slice(0, 8)}`);
  for (const c of upstream) assert.ok(disclosure.includes(`| ${c.sha.slice(0, 8)} | #${c.pr} | ${c.by} |`), `disclosure.md should credit upstream #${c.pr} (${c.sha.slice(0, 8)}) to ${c.by}`);
});

test('the landing copy is what /pom/ shows', () => {
  const html = readFileSync(path.join(REPO_DIR, 'src/client/showcase/index.html'), 'utf8');
  const text = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
  const landing = new Map(fields(read('landing.md')).map((f) => [f.name, f.text]));
  assert.ok(html.includes(`<h1>${landing.get('Headline')}</h1>`));
  assert.ok(html.includes(`<p class="lede">${landing.get('Lede')}</p>`));
  assert.ok(html.includes(`<meta property="og:description" content="${landing.get('Share text')}" />`));
  for (const name of ['Credit', 'Testnet notice']) assert.ok(text.includes(landing.get(name)!), `${name} differs from the page`);
});

test('every kit credits upstream by name and license, and no doc claims mainnet use', () => {
  for (const kit of kitFiles()) {
    const text = read(kit);
    assert.ok(text.includes('webdevcody') && /\bMIT\b/.test(text), `${kit} does not credit webdevcody (MIT)`);
  }
  for (const doc of launchDocs()) assert.ok(!/\b(live|deployed|running) on (Solana |Base )?mainnet\b/i.test(read(doc)), `${doc} claims mainnet`);
});

test('relative links in the launch docs resolve to files in the repo', () => {
  for (const doc of launchDocs()) {
    const rel = `launch/chain/${doc}`;
    for (const m of read(doc).matchAll(/\]\(([^)\s]+)\)/g)) {
      const href = m[1];
      if (/^https:\/\//.test(href)) continue;
      assert.ok(!/^http:/.test(href), `${rel}: insecure link ${href}`);
      const target = resolveDocLink(rel, href);
      assert.ok(target, `${rel}: unresolvable link ${href}`);
      assert.ok(existsSync(path.join(REPO_DIR, target.path)), `${rel}: broken link ${href}`);
    }
  }
});

test('the office bookshelf lists the kit with titles, so it can be read inside the office', async () => {
  const { files } = await new Docs(REPO_DIR).list();
  const shelf = new Map(files.map((f) => [f.path, f.title]));
  assert.equal(shelf.get('launch/chain/README.md'), 'Kipdeck chain launch kit');
  assert.equal(shelf.get('launch/chain/colosseum-worlds-fair.md'), "Colosseum Crypto World's Fair");
  for (const doc of launchDocs()) assert.ok(shelf.get(`launch/chain/${doc}`), `${doc} missing from the shelf or untitled`);
});
