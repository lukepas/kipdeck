// The static export of the public showcase (src/showcase.ts): the files GitHub Pages serves, made
// from the recorded dataset, with every repository redacted unless known public.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildSite, publicRepos } from '../src/showcase.js';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');
const dataset = () => JSON.parse(readFileSync(path.join(FIXTURES, 'dataset.json'), 'utf8'));

function bundle(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'pom-bundle-'));
  mkdirSync(path.join(dir, 'assets'));
  writeFileSync(path.join(dir, 'index.html'), '<meta property="og:image" content="__POM_OG__"><meta property="og:url" content="__POM_URL__">');
  writeFileSync(path.join(dir, 'assets', 'app.js'), 'export {};');
  return dir;
}

test('the site: the page, showcase.json, the board, the card, and never the dataset', () => {
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'pom-site-')), 'site');
  const doc = buildSite({ dataset: dataset(), leaderboard: { boards: [] }, bundle: bundle(), out, base: 'base-sepolia', asOf: 1790864000, siteUrl: 'https://example.github.io/pom/' });
  for (const f of ['index.html', 'showcase.json', 'leaderboard.json', 'og.png', '.nojekyll', 'assets/app.js']) assert.ok(existsSync(path.join(out, f)), f);
  assert.ok(!existsSync(path.join(out, 'dataset.json')));
  assert.match(readFileSync(path.join(out, 'index.html'), 'utf8'), /content="https:\/\/example\.github\.io\/pom\/og\.png"/);
  assert.equal(doc.source, 'chain');
  assert.equal(doc.live, null);
  // Nothing said the repository is public: it reads "a private repo", here and in the files.
  assert.ok(doc.events.every((e) => e.repo === null));
  assert.ok(!readFileSync(path.join(out, 'showcase.json'), 'utf8').includes('acme/app'));
  // The local run's payout has no devnet link.
  assert.ok(doc.events.every((e) => !e.links.solana));
});

test('known public repositories show in full; hidden ones go', () => {
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'pom-site-')), 'site');
  const doc = buildSite({ dataset: dataset(), bundle: bundle(), out, base: 'base-sepolia', asOf: 1790864000, repos: { 'acme/app': { private: false } } });
  assert.ok(doc.events.every((e) => e.repo === 'acme/app'));
  const none = buildSite({ dataset: dataset(), bundle: bundle(), out, base: 'base-sepolia', asOf: 1790864000, visibility: { 'acme/app': 'hidden' } });
  assert.equal(none.events.length, 0);
  assert.throws(() => buildSite({ dataset: dataset(), bundle: bundle(), out, base: 'base-sepolia', asOf: 1, siteUrl: 'http://insecure.example/' }), /https/);
});

test('publicRepos believes only a public answer for the same repository', async () => {
  const answers: Record<string, unknown> = {
    'https://api.github.com/repos/acme/app': { private: false, full_name: 'acme/app' },
    'https://api.github.com/repos/acme/secret': { private: true, full_name: 'acme/secret' },
    'https://api.github.com/repos/acme/moved': { private: false, full_name: 'other/name' },
  };
  const fake = (async (url: string) => (answers[url] ? new Response(JSON.stringify(answers[url])) : new Response('{}', { status: 404 }))) as unknown as typeof fetch;
  assert.deepEqual(await publicRepos(['acme/app', 'acme/secret', 'acme/moved', 'acme/gone', 'bad name'], fake), { 'acme/app': { private: false } });
});
