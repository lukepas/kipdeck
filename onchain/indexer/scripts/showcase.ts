#!/usr/bin/env -S node --import tsx
// Exports the public showcase as static files for GitHub Pages, from what scripts/index.ts wrote.
//
//   tsx scripts/showcase.ts --dataset out/dataset.json [--leaderboard out/leaderboard.json]
//       [--bundle ../../dist/showcase] [--out site/] [--site-url https://you.github.io/repo/]
//       [--snapshot office-showcase.json] [--network base-sepolia|localnet]
//       [--public owner/a,owner/b] [--redacted owner/c] [--hidden owner/d] [--check-github]
//
// Repositories show in full only when known public: --public, or --check-github (GitHub's public
// API, no token). Everything else reads "a private repo". --hidden leaves a repository out.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { RepoVisibility } from '../../../src/shared/showcase.js';
import { buildSite, publicRepos } from '../src/showcase.js';

function args(argv = process.argv.slice(2)): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      out[a.slice(2)] = next;
      i++;
    } else out[a.slice(2)] = true;
  }
  return out;
}

const a = args();
const str = (k: string) => (typeof a[k] === 'string' ? (a[k] as string) : undefined);
const list = (k: string) => (str(k) ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const json = (file: string | undefined) => (file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined);

const datasetFile = str('dataset') ?? 'out/dataset.json';
const dataset = json(datasetFile);
if (!dataset || !Array.isArray(dataset.events)) {
  console.error(`No dataset at ${datasetFile}: run npm run index first`);
  process.exit(1);
}
const network = str('network') ?? 'base-sepolia';
if (network !== 'base-sepolia' && network !== 'localnet') {
  console.error('--network is base-sepolia or localnet (testnets only)');
  process.exit(1);
}
const visibility: Record<string, RepoVisibility> = {};
for (const r of list('redacted')) visibility[r] = 'redacted';
for (const r of list('hidden')) visibility[r] = 'hidden';
const repos: Record<string, { private?: boolean }> = {};
for (const r of list('public')) repos[r] = { private: false };
if (a['check-github']) {
  const named = [...new Set((dataset.events as { repo: string }[]).map((e) => e.repo))].filter((r) => !(r in repos));
  Object.assign(repos, await publicRepos(named));
}

const out = str('out') ?? 'site';
const doc = buildSite({
  dataset,
  leaderboard: json(str('leaderboard') ?? path.join(path.dirname(datasetFile), 'leaderboard.json')),
  snapshot: json(str('snapshot')),
  bundle: str('bundle') ?? path.join(import.meta.dirname, '..', '..', '..', 'dist', 'showcase'),
  out,
  siteUrl: str('site-url'),
  base: network,
  repos,
  visibility,
  asOf: Number(str('as-of')) || Math.floor(Date.now() / 1000),
});
console.log(`Wrote ${out}/: ${doc.events.length} outcomes, ${doc.counters.merged} merged, ${doc.counters.usdcPaid} USDC paid, ${doc.bounties.length} open bounties.`);
