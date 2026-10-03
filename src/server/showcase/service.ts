// The public showcase's data, as the office serves it at /pom/showcase.json: the outcomes people
// caused (rebuilt from the chain by onchain/indexer when the office runs it, else the office's own
// record of what it attested), the floors' open bounties, and the live floor strip from the same
// roster Mission control ranks. Everything goes through publicShowcase (shared/showcase.ts), which
// is what decides what is public; this file only gathers. Built at most every CACHE_MS, so a crowd
// opening the link from a post costs the office one build.
import { existsSync, readFileSync } from 'node:fs';
import { attention, type AttentionLevel } from '../../shared/attention.js';
import type { RepEvent } from '../../shared/reputation.js';
import { publicShowcase, visibilityOf, type ShowcaseDoc, type ShowcaseInput, type ShowcaseInputBounty, type ShowcaseInputWorker, type ShowcaseWorkerState } from '../../shared/showcase.js';
import type { ShowcaseSettingsState } from '../../shared/protocol.js';
import { sdkCandidates } from '../chain/sdk.js';
import type { Floor } from '../floor.js';
import type { Ctx } from '../office/context.js';
import { ShowcaseSettings } from './settings.js';

/** How long one build of the document is served for. */
export const CACHE_MS = 15_000;
/** The EAS predeploy on Base Sepolia (and every OP Stack chain). */
const EAS_PREDEPLOY = '0x4200000000000000000000000000000000000021';
const STATE_OF: Record<AttentionLevel, ShowcaseWorkerState> = { 'needs-you': 'needs-input', stuck: 'stuck', review: 'in-review', working: 'working', parked: 'idle' };

/** A deployment file shipped with an onchain package (public addresses only), if it is there. */
function deployment(pkg: string, name: string): Record<string, any> | undefined {
  const file = sdkCandidates(undefined, ['onchain', pkg, 'deployments', name]).find((c) => existsSync(c));
  try {
    return file ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
  } catch {
    return undefined;
  }
}

/** The board onchain/indexer rebuilt from the chain alone, when the office runs it (--reputation-index). */
interface IndexedDataset {
  events?: RepEvent[];
  agents?: { agentId: string; tx?: string }[];
  sources?: { attesters?: string[]; registrars?: string[]; schemaUid?: string; eas?: string; identity?: string; reputation?: string; solana?: { cluster?: string; programId?: string } };
}

export class Showcase {
  readonly settings: ShowcaseSettings;
  private cache?: { key: string; at: number; doc: Promise<ShowcaseDoc> };

  constructor(private ctx: Ctx) {
    this.settings = new ShowcaseSettings(ctx.cfg.dataDir);
  }

  get enabled(): boolean {
    return this.settings.get().enabled;
  }

  /** Settings changed: the next request builds again. */
  invalidate() {
    this.cache = undefined;
  }

  /** The document for a page reached at `officeUrl` (for the "Fund this issue" links). */
  doc(officeUrl: string, now = Date.now()): Promise<ShowcaseDoc> {
    const c = this.cache;
    if (c && c.key === officeUrl && now - c.at < CACHE_MS) return c.doc;
    const doc = this.input(officeUrl, now).then(publicShowcase);
    this.cache = { key: officeUrl, at: now, doc };
    doc.catch(() => {
      if (this.cache?.doc === doc) this.cache = undefined;
    });
    return doc;
  }

  /** What ⚙️ Settings shows an admin: the choices, and every floor's repository with how it shows now. */
  async state(): Promise<ShowcaseSettingsState> {
    const s = this.settings.get();
    const repos = await this.repos();
    const names = new Set([...Object.keys(repos), ...Object.keys(s.repos)]);
    const known = [...names].sort().map((repo) => ({ repo, ...(repos[repo]?.private !== undefined ? { private: repos[repo].private } : {}), shows: visibilityOf(repo, { repos, visibility: s.repos }) }));
    return { enabled: s.enabled, repos: s.repos, known, ...(s.by ? { by: s.by } : {}), ...(s.at ? { at: s.at } : {}) };
  }

  /** Each floor's repository and whether GitHub says it is private (gh is asked once per floor). */
  private async repoOfFloors(): Promise<Map<Floor, { repo: string; private?: boolean }>> {
    const out = new Map<Floor, { repo: string; private?: boolean }>();
    await Promise.all(
      [...this.ctx.floors.values()].map(async (f) => {
        try {
          const r = await f.github.repoInfo();
          out.set(f, { repo: r.nameWithOwner.toLowerCase(), ...(r.private !== undefined ? { private: r.private } : {}) });
        } catch {
          // gh can't say yet: its outcomes stay redacted
        }
      }),
    );
    return out;
  }

  private async repos(): Promise<Record<string, { private?: boolean }>> {
    const out: Record<string, { private?: boolean }> = {};
    for (const { repo, private: p } of (await this.repoOfFloors()).values()) out[repo] = p === undefined ? {} : { private: p };
    return out;
  }

  private async input(officeUrl: string, nowMs: number): Promise<ShowcaseInput> {
    const { ctx } = this;
    const s = this.settings.get();
    const floors = await this.repoOfFloors();
    const repos: Record<string, { private?: boolean }> = {};
    const titles: Record<string, string> = {};
    for (const [f, r] of floors) {
      repos[r.repo] = r.private === undefined ? {} : { private: r.private };
      for (const p of f.github.pulls.items) titles[`${r.repo}#${p.number}`] = p.title;
    }
    const shows = (repo: string) => visibilityOf(repo, { repos, visibility: s.repos });

    // Open bounties on devnet, never the mock's.
    const bounties: ShowcaseInputBounty[] = [];
    if (ctx.bounties.enabled && ctx.bounties.network === 'solana-devnet') {
      for (const [f, r] of floors) {
        const st = ctx.bounties.state(f);
        const issueTitle = new Map(f.github.issues.items.map((i) => [i.number, i.title]));
        for (const b of st.items) {
          if ((b.phase !== 'open' && b.phase !== 'claimed') || b.expiry <= nowMs) continue;
          bounties.push({ repo: r.repo, issue: b.issue, title: issueTitle.get(b.issue), amount: b.amount, decimals: b.decimals, symbol: b.symbol, expiry: b.expiry, blink: st.blink });
        }
      }
    }

    // The live floor strip: agents only, none from a hidden repository's floor.
    const floor: ShowcaseInputWorker[] = [];
    for (const e of ctx.rosterEntries()) {
      if (e.kind !== 'agent') continue;
      const f = ctx.floors.get(e.floor);
      const r = f && floors.get(f);
      if (!f || !r || shows(r.repo) === 'hidden') continue;
      floor.push({ name: e.name, color: e.color, harness: f.workers.get(e.id)?.provider, state: STATE_OF[attention(e, nowMs).level] });
    }

    // The outcomes: from the chain when the office rebuilds the board from it, else its own record.
    const indexed = ctx.reputationIndex?.read('dataset.json') as IndexedDataset | undefined;
    const fromChain = Array.isArray(indexed?.events);
    const events = fromChain ? indexed!.events! : (ctx.reputation?.events() ?? []);
    const src = fromChain ? (indexed!.sources ?? {}) : ((await ctx.reputation?.sources()) ?? { attesters: [], registrars: [] });
    const identities = ctx.reputation?.identities.list() ?? [];
    const labelOf = new Map(identities.flatMap((a) => (a.agentId ? [[a.agentId, a] as const] : [])));
    const agents = (fromChain ? (indexed!.agents ?? []) : identities.flatMap((a) => (a.agentId ? [{ agentId: a.agentId, tx: a.tx }] : []))).map((a) => {
      const id = labelOf.get(a.agentId);
      return { agentId: a.agentId, harness: id?.harness, label: id?.label, tx: a.tx };
    });

    const attest = ctx.cfg.chain.attest;
    const local = attest.rpc.startsWith('http://127.0.0.1') || attest.rpc.startsWith('http://localhost');
    const programId = ctx.bounties.state(undefined).programId ?? deployment('solana', 'devnet.json')?.programId;
    const sol = (indexed?.sources?.solana?.cluster ?? (ctx.bounties.network === 'solana-devnet' ? 'devnet' : 'none')) as string;
    const base = deployment('attest', 'base-sepolia.json');
    const reg = deployment('reputation', 'base-sepolia.json');
    const extra = src as IndexedDataset['sources'] & { identity?: string; reputation?: string };
    return {
      asOf: Math.floor(nowMs / 1000),
      source: fromChain ? 'chain' : 'office',
      base: local ? 'localnet' : 'base-sepolia',
      solana: sol === 'devnet' || sol === 'localnet' ? sol : 'none',
      events,
      agents,
      titles,
      repos,
      visibility: s.repos,
      bounties,
      floor,
      floorAt: Math.floor(nowMs / 1000),
      officeUrl,
      verify: {
        programId,
        schemaUid: extra?.schemaUid ?? attest.schema ?? base?.schemaUid,
        eas: extra?.eas ?? attest.eas ?? EAS_PREDEPLOY,
        identity: extra?.identity ?? reg?.identity,
        reputation: extra?.reputation ?? reg?.reputation,
        attesters: extra?.attesters?.length ? extra.attesters : [base?.attester].filter(Boolean),
        registrars: extra?.registrars?.length ? extra.registrars : [reg?.registrar].filter(Boolean),
      },
    };
  }
}
