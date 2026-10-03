// The public showcase as static files, for GitHub Pages: the page's bundle (dist/showcase, built by
// the office's `npm run build`), showcase.json made by the same serializer the office uses
// (src/shared/showcase.ts) from a dataset this indexer rebuilt from the chain, the board
// (leaderboard.json) and the share card (og.png). The link keeps working when the office is off.
//
// Never copies dataset.json: it names every repository, and the page redacts the private ones.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { RepEvent } from '../../../src/shared/reputation.js';
import { publicShowcase, type RepoVisibility, type ShowcaseDoc, type ShowcaseInput } from '../../../src/shared/showcase.js';
import { ogImage } from '../../../src/server/showcase/og.js';

export interface SiteOptions {
  /** dataset.json as this indexer wrote it. */
  dataset: { events: RepEvent[]; agents?: { agentId: string; tx?: string }[]; sources?: Record<string, any> };
  /** leaderboard.json as this indexer wrote it, copied as it is. */
  leaderboard?: unknown;
  /** The office's own /pom/showcase.json, for its open bounties, agent names and last floor strip. */
  snapshot?: ShowcaseDoc;
  /** The built page (dist/showcase). */
  bundle: string;
  out: string;
  /** Where the site is published (https://you.github.io/repo/), for the share card's absolute URL. */
  siteUrl?: string;
  base: 'base-sepolia' | 'localnet';
  /** Repositories known public (shown in full) or private, and any admin-style choices. */
  repos?: Record<string, { private?: boolean }>;
  visibility?: Record<string, RepoVisibility>;
  asOf: number;
}

/** What publicShowcase gets for a static export. */
export function siteInput(o: SiteOptions): ShowcaseInput {
  const src = o.dataset.sources ?? {};
  const snap = o.snapshot;
  const cluster = src.solana?.cluster;
  const officeUrl = snap?.bounties.map((b) => b.fund?.action).find(Boolean);
  const labels = new Map((snap?.agents ?? []).map((a) => [a.agentId, a]));
  return {
    asOf: o.asOf,
    source: 'chain',
    base: o.base,
    solana: cluster === 'devnet' || cluster === 'localnet' ? cluster : 'none',
    events: o.dataset.events,
    agents: (o.dataset.agents ?? []).map((a) => ({ agentId: a.agentId, tx: a.tx, harness: labels.get(a.agentId)?.harness, label: labels.get(a.agentId)?.label })),
    repos: o.repos ?? {},
    visibility: o.visibility ?? {},
    // Only the snapshot's bounties it showed in full: a redacted one has no repository to fund.
    bounties: (snap?.bounties ?? []).flatMap((b) => (b.repo ? [{ repo: b.repo, issue: b.issue, title: b.title ?? undefined, amount: b.amount, decimals: b.decimals, symbol: b.symbol, expiry: b.expiry, blink: !!b.fund }] : [])),
    ...(snap?.live ? { floor: snap.live.workers.map((w) => ({ ...w })), floorAt: snap.live.at } : {}),
    ...(officeUrl ? { officeUrl: new URL(officeUrl).origin } : {}),
    verify: {
      programId: src.solana?.programId,
      schemaUid: src.schemaUid,
      eas: src.eas,
      identity: src.identity,
      reputation: src.reputation,
      attesters: src.attesters,
      registrars: src.registrars,
    },
  };
}

/** Writes the site into `o.out` (emptied first) and returns the document it shows. */
export function buildSite(o: SiteOptions): ShowcaseDoc {
  if (!existsSync(path.join(o.bundle, 'index.html'))) throw new Error(`No showcase bundle in ${o.bundle}: run npm run build at the repository root`);
  if (o.siteUrl && !/^https:\/\/[^\s"<>]+\/$/.test(o.siteUrl)) throw new Error('--site-url is the https address the site is published at, ending in /');
  const doc = publicShowcase(siteInput(o));
  rmSync(o.out, { recursive: true, force: true });
  mkdirSync(o.out, { recursive: true });
  for (const f of readdirSync(o.bundle)) if (f !== 'index.html') cpSync(path.join(o.bundle, f), path.join(o.out, f), { recursive: true });
  const html = readFileSync(path.join(o.bundle, 'index.html'), 'utf8')
    .replaceAll('__POM_OG__', o.siteUrl ? `${o.siteUrl}og.png` : 'og.png')
    .replaceAll('__POM_URL__', o.siteUrl ?? './');
  writeFileSync(path.join(o.out, 'index.html'), html);
  writeFileSync(path.join(o.out, 'showcase.json'), `${JSON.stringify(doc, null, 1)}\n`);
  if (o.leaderboard) writeFileSync(path.join(o.out, 'leaderboard.json'), `${JSON.stringify(o.leaderboard, null, 1)}\n`);
  writeFileSync(path.join(o.out, 'og.png'), ogImage(doc));
  // GitHub Pages: serve the files as they are.
  writeFileSync(path.join(o.out, '.nojekyll'), '');
  return doc;
}

/**
 * Which of `repos` GitHub says are public, asking its public API without a token (60 an hour).
 * A repository it can't see (private, gone, or the limit hit) stays unknown, so it shows redacted.
 */
export async function publicRepos(repos: readonly string[], fetchImpl: typeof fetch = fetch): Promise<Record<string, { private?: boolean }>> {
  const out: Record<string, { private?: boolean }> = {};
  for (const repo of repos) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) continue;
    try {
      const res = await fetchImpl(`https://api.github.com/repos/${repo}`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'agent-office-pom-indexer' }, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      const body = (await res.json()) as { private?: unknown; full_name?: unknown };
      if (body.private === false && typeof body.full_name === 'string' && body.full_name.toLowerCase() === repo) out[repo] = { private: false };
    } catch {
      // unknown: redacted
    }
  }
  return out;
}
