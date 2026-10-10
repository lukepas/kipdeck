// The public showcase (/pom/ on the office, or static files on GitHub Pages): what it may show, and
// the one serializer that decides it. publicShowcase builds every object it returns field by field
// from a whitelist, so nothing the office keeps (prompts, terminal output, file paths, emails,
// account ids, tokens, branch names, a worker's environment) can reach the page by being passed in
// by mistake. tests/showcase.test.ts walks its output and fails on any key not listed here.
//
// Pure, with no Node imports: the office's route, the showcase page and onchain/indexer's static
// export all load this file as it is, so the three never disagree on what is public.
import { DATA_COLORS } from './datacolors.js';
import { OTHER_SYMBOL, commonSymbol, sumUnits as sumMoney, tokenSymbol, tokenUnits } from './money.js';
import type { RepEvent, RepOutcome } from './reputation.js';

/** How a repository shows: its name and titles, "a private repo", or not at all. */
export type RepoVisibility = 'full' | 'redacted' | 'hidden';
export const REPO_VISIBILITIES: readonly RepoVisibility[] = ['full', 'redacted', 'hidden'];

/** What a worker on the live floor strip is doing, in a stranger's words. */
export type ShowcaseWorkerState = 'working' | 'needs-input' | 'stuck' | 'in-review' | 'idle';

/** The harnesses the board names; anything else is "other". */
export const HARNESSES: Readonly<Record<string, string>> = { claude: 'Claude Code', codex: 'Codex', cursor: 'Cursor', pi: 'Pi', other: 'Other' };
export const harnessGroup = (h: string | undefined): string => (h && h in HARNESSES && h !== 'other' ? h : 'other');

/** The public explorers and their testnet pages: the only links the page carries. */
export const EXPLORERS = {
  easAttestation: (uid: string) => `https://base-sepolia.easscan.org/attestation/view/${uid}`,
  easSchema: (uid: string) => `https://base-sepolia.easscan.org/schema/view/${uid}`,
  baseTx: (tx: string) => `https://sepolia.basescan.org/tx/${tx}`,
  baseAddress: (a: string) => `https://sepolia.basescan.org/address/${a}`,
  solanaTx: (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
  solanaAddress: (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`,
} as const;

export const UPSTREAM = { name: 'agent-office', author: 'webdevcody', url: 'https://github.com/AgentSystemLabs/agent-office', license: 'MIT' } as const;

/** Most outcomes the page lists; the board and counters are worked out over all of them. */
export const EVENTS_KEPT = 2000;
const WORKERS_KEPT = 60;
const BOUNTIES_KEPT = 100;

// What the office or the indexer hands the serializer. Wider than what goes out on purpose: the
// office passes what it has, and the serializer picks.

export interface ShowcaseInputBounty {
  repo: string;
  issue: number;
  title?: string;
  /** Base units, as a string (u64). */
  amount: string;
  decimals: number;
  symbol: string;
  /** Unix ms. */
  expiry: number;
  /** The repository takes funding from the public "Fund this issue" Action. */
  blink: boolean;
  [more: string]: unknown;
}

export interface ShowcaseInputWorker {
  name: string;
  /** Its call sign on the deck ("A-03", shared/callsign.ts), so the ledger names units as the office does. */
  sign?: string;
  color: string;
  harness?: string;
  state: ShowcaseWorkerState;
  [more: string]: unknown;
}

export interface ShowcaseInputAgent {
  agentId: string;
  harness?: string;
  /** The worker's own name part of its identity (never the operator's). */
  label?: string;
  /** The registration transaction. */
  tx?: string;
  [more: string]: unknown;
}

export interface ShowcaseVerifyInput {
  programId?: string;
  schemaUid?: string;
  eas?: string;
  identity?: string;
  reputation?: string;
  attesters?: readonly string[];
  registrars?: readonly string[];
}

export interface ShowcaseInput {
  /** Seconds since the epoch: when this was put together. */
  asOf: number;
  /** Rebuilt from the chain alone (onchain/indexer), or the office's own record of what it attested. */
  source: 'chain' | 'office';
  /** Where the Base side was read: Base Sepolia, or a local test chain. */
  base: 'base-sepolia' | 'localnet';
  /** Where bounties were paid: Solana devnet, a local validator, or nowhere. */
  solana: 'devnet' | 'localnet' | 'none';
  events: readonly RepEvent[];
  agents?: readonly ShowcaseInputAgent[];
  /** Pull request titles by "owner/name#N". */
  titles?: Readonly<Record<string, string>>;
  /** What the office knows of each repository ("owner/name", lower case): private or not. */
  repos?: Readonly<Record<string, { private?: boolean }>>;
  /** An admin's choices per repository, over the defaults. */
  visibility?: Readonly<Record<string, RepoVisibility>>;
  bounties?: readonly ShowcaseInputBounty[];
  /** The live floor strip: only when the office serves the page (or from its last snapshot). */
  floor?: readonly ShowcaseInputWorker[];
  /** When the floor strip was taken, seconds (a static export carries an older snapshot). */
  floorAt?: number;
  /** The office's public https address, for the "Fund this issue" Action. */
  officeUrl?: string;
  /** The bounty mint, for payouts recorded without one (older office records, an older dataset). */
  mint?: string;
  verify: ShowcaseVerifyInput;
}

// What goes out.

export interface ShowcaseEvent {
  agentId: string;
  harness: string;
  /** null: a redacted repository. */
  repo: string | null;
  pr: number;
  title: string | null;
  outcome: RepOutcome;
  at: number;
  openedAt?: number;
  mergedAt?: number;
  /** A short pseudonym of who merged or closed it (the start of the attestation's mergedByHash). */
  maintainer?: string;
  self: boolean;
  /** The payout: its amount, its token's mint when known, and the symbol tokenSymbol gives the mint. */
  paid?: { amount: string; decimals: number; mint?: string; symbol: string };
  links: { attestation?: string; feedback?: string; solana?: string };
}

export interface ShowcaseBounty {
  repo: string | null;
  issue: number;
  title: string | null;
  amount: string;
  decimals: number;
  symbol: string;
  expiry: number;
  /** The Action's URL, a dial.to Blink for it, and the solana-action: link wallets open directly. */
  fund?: { action: string; blink: string; wallet: string };
}

export interface ShowcaseWorker {
  name: string;
  /** Its call sign, when it has one: a letter, a dash and two digits. */
  sign?: string;
  color: string;
  harness: string;
  state: ShowcaseWorkerState;
}

export interface ShowcaseAgent {
  agentId: string;
  harness: string;
  label?: string;
  registered?: string;
}

export interface ShowcaseDoc {
  schema: 'agent-office/showcase@1';
  asOf: number;
  source: 'chain' | 'office';
  network: { base: 'base-sepolia' | 'localnet'; solana: 'devnet' | 'localnet' | 'none' };
  counters: {
    merged: number;
    /** Whole tokens, "25.00" (the name is older than the test mint: see paidSymbol). */
    usdcPaid: string;
    /** What usdcPaid is in: "USDC", "TEST", or "TOKENS" for a mix or an unknown mint. */
    paidSymbol: string;
    maintainers: number;
    paidWorkers: number;
    /** Where each one can be checked. */
    links: { merged?: string; usdcPaid?: string; maintainers?: string; paidWorkers?: string };
  };
  /** null when there is no floor to show (a static export without a snapshot). */
  live: { at: number; workers: ShowcaseWorker[] } | null;
  events: ShowcaseEvent[];
  agents: ShowcaseAgent[];
  bounties: ShowcaseBounty[];
  verify: {
    programId?: string;
    programUrl?: string;
    schemaUid?: string;
    schemaUrl?: string;
    eas?: string;
    identity?: string;
    identityUrl?: string;
    reputation?: string;
    reputationUrl?: string;
    attesters: string[];
    registrars: string[];
    command: string;
  };
  credit: { name: string; author: string; url: string; license: string };
}

const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIG = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;
const REPO = /^[a-z0-9_.-]{1,100}\/[a-z0-9_.-]{1,100}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const OUTCOMES = new Set<RepOutcome>(['merged', 'reverted', 'closed']);
const STATES = new Set<ShowcaseWorkerState>(['working', 'needs-input', 'stuck', 'in-review', 'idle']);

const int = (v: unknown, min = 0): number | undefined => (Number.isSafeInteger(v) && (v as number) >= min ? (v as number) : undefined);
/** Printable text, one line, at most `max` characters. */
export function plain(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim();
  return s ? (s.length > max ? `${s.slice(0, max - 3)}...` : s) : undefined;
}

/**
 * How a repository shows: the admin's choice if there is one, else its full name when GitHub says
 * it is public, and redacted otherwise (private, or nothing known about it).
 */
export function visibilityOf(repo: string, input: Pick<ShowcaseInput, 'repos' | 'visibility'>): RepoVisibility {
  const chosen = input.visibility?.[repo];
  if (chosen && REPO_VISIBILITIES.includes(chosen)) return chosen;
  return input.repos?.[repo]?.private === false ? 'full' : 'redacted';
}

/** The tx hash out of a basescan link the office or indexer made, if it is one. */
function baseTxOf(link: string | undefined): string | undefined {
  const m = /^https:\/\/sepolia\.basescan\.org\/tx\/(0x[0-9a-fA-F]{64})$/.exec(link ?? '');
  return m?.[1];
}

function eventOf(e: RepEvent, repoShown: string | null, title: string | null, input: ShowcaseInput): ShowcaseEvent | undefined {
  const pr = int(e.pr, 1);
  const at = int(e.at, 1);
  if (!pr || !at || !OUTCOMES.has(e.outcome) || typeof e.agentId !== 'string' || !/^\d{1,30}$/.test(e.agentId)) return undefined;
  const out: ShowcaseEvent = { agentId: e.agentId, harness: harnessGroup(plain(e.harness, 20)), repo: repoShown, pr, title, outcome: e.outcome, at, self: e.self === true, links: {} };
  const opened = int(e.openedAt, 1);
  if (opened) out.openedAt = opened;
  const merged = int(e.mergedAt, 1);
  if (merged) out.mergedAt = merged;
  if (typeof e.maintainer === 'string' && /^0x[0-9a-fA-F]{10,}/.test(e.maintainer) && !/^0x0*$/.test(e.maintainer)) out.maintainer = e.maintainer.slice(0, 12).toLowerCase();
  if (e.paid && /^\d{1,20}$/.test(e.paid.amount) && int(e.paid.decimals) !== undefined && e.paid.decimals <= 18) {
    const mint = pick(e.paid.mint, BASE58) ?? pick(input.mint, BASE58);
    out.paid = { amount: e.paid.amount, decimals: e.paid.decimals, ...(mint ? { mint } : {}), symbol: tokenSymbol(mint) };
    if (repoShown && input.solana === 'devnet' && SIG.test(e.paid.tx)) out.links.solana = EXPLORERS.solanaTx(e.paid.tx);
  }
  // A redacted repository gets no links: the attestation's page decodes the repository's name, and
  // the feedback and the payout lead to it as well.
  if (repoShown && input.base === 'base-sepolia') {
    if (typeof e.uid === 'string' && HEX32.test(e.uid)) out.links.attestation = EXPLORERS.easAttestation(e.uid.toLowerCase());
    const fb = baseTxOf(e.links?.feedback);
    if (fb) out.links.feedback = EXPLORERS.baseTx(fb.toLowerCase());
  }
  return out;
}

function bountyOf(b: ShowcaseInputBounty, vis: RepoVisibility, input: ShowcaseInput): ShowcaseBounty | undefined {
  const issue = int(b.issue, 1);
  const decimals = int(b.decimals);
  const expiry = int(b.expiry);
  if (!issue || decimals === undefined || decimals > 18 || expiry === undefined || typeof b.amount !== 'string' || !/^\d{1,20}$/.test(b.amount)) return undefined;
  const full = vis === 'full';
  const out: ShowcaseBounty = { repo: full ? b.repo : null, issue, title: full ? (plain(b.title, 140) ?? null) : null, amount: b.amount, decimals, symbol: plain(b.symbol, 10) ?? OTHER_SYMBOL, expiry };
  // The Action's URL names the repository, so a redacted one gets no fund link.
  const office = input.officeUrl && /^https?:\/\/[A-Za-z0-9.\-:[\]]+$/.test(input.officeUrl) ? input.officeUrl : undefined;
  if (full && b.blink && office) {
    const action = `${office}/api/actions/fund?repo=${encodeURIComponent(b.repo)}&issue=${issue}`;
    out.fund = { action, blink: `https://dial.to/?action=${encodeURIComponent(`solana-action:${action}`)}&cluster=devnet`, wallet: `solana-action:${action}` };
  }
  return out;
}

function workerOf(w: ShowcaseInputWorker): ShowcaseWorker | undefined {
  const name = plain(w.name, 40);
  if (!name || !STATES.has(w.state)) return undefined;
  const sign = typeof w.sign === 'string' && /^[A-Z]-\d{2}$/.test(w.sign) ? w.sign : undefined;
  return { name, ...(sign ? { sign } : {}), color: typeof w.color === 'string' && COLOR.test(w.color) ? w.color.toLowerCase() : DATA_COLORS[0].toLowerCase(), harness: harnessGroup(plain(w.harness, 20)), state: w.state };
}

/** Whole tokens from base units, summed over amounts that may differ in decimals: "25.00". */
function sumUnits(items: readonly { amount: string; decimals: number }[]): string {
  const t = sumMoney(items);
  return tokenUnits(t.units, t.decimals);
}

const pick = <T extends string>(v: string | undefined, re: RegExp): T | undefined => (v && re.test(v) ? (v as T) : undefined);

/** The public showcase document: everything the page shows, and nothing else. */
export function publicShowcase(input: ShowcaseInput): ShowcaseDoc {
  const vis = new Map<string, RepoVisibility>();
  const visOf = (repo: string) => {
    let v = vis.get(repo);
    if (!v) vis.set(repo, (v = REPO.test(repo) ? visibilityOf(repo, input) : 'redacted'));
    return v;
  };
  const events: ShowcaseEvent[] = [];
  for (const e of input.events) {
    const repo = typeof e.repo === 'string' ? e.repo.toLowerCase() : '';
    const v = visOf(repo);
    if (v === 'hidden') continue;
    const title = v === 'full' ? (plain(input.titles?.[`${repo}#${e.pr}`], 140) ?? null) : null;
    const ev = eventOf(e, v === 'full' ? repo : null, title, input);
    if (ev) events.push(ev);
  }
  events.sort((a, b) => b.at - a.at || b.pr - a.pr);
  events.splice(EVENTS_KEPT);

  const merged = events.filter((e) => e.outcome === 'merged');
  const external = merged.filter((e) => !e.self);
  const paid = events.filter((e) => e.paid);
  const verify = input.verify;
  const programId = pick(verify.programId, BASE58);
  const schemaUid = pick(verify.schemaUid, HEX32);
  const identity = pick(verify.identity, EVM_ADDRESS);
  const reputation = pick(verify.reputation, EVM_ADDRESS);
  const eas = pick(verify.eas, EVM_ADDRESS);
  const onBase = input.base === 'base-sepolia';
  const onDevnet = input.solana === 'devnet';
  const attesters = (verify.attesters ?? []).filter((a) => EVM_ADDRESS.test(a)).map((a) => a.toLowerCase()).slice(0, 10);
  const registrars = (verify.registrars ?? []).filter((a) => EVM_ADDRESS.test(a)).map((a) => a.toLowerCase()).slice(0, 10);

  const agents: ShowcaseAgent[] = [];
  const seen = new Set<string>();
  for (const a of input.agents ?? []) {
    if (typeof a.agentId !== 'string' || !/^\d{1,30}$/.test(a.agentId) || seen.has(a.agentId)) continue;
    seen.add(a.agentId);
    const out: ShowcaseAgent = { agentId: a.agentId, harness: harnessGroup(plain(a.harness, 20)) };
    const label = plain(a.label, 40);
    if (label) out.label = label;
    if (onBase && typeof a.tx === 'string' && HEX32.test(a.tx)) out.registered = EXPLORERS.baseTx(a.tx.toLowerCase());
    agents.push(out);
  }

  const bounties = (input.bounties ?? [])
    .flatMap((b) => {
      const repo = typeof b.repo === 'string' ? b.repo.toLowerCase() : '';
      const v = visOf(repo);
      const out = v === 'hidden' ? undefined : bountyOf({ ...b, repo }, v, input);
      return out ? [out] : [];
    })
    .sort((a, b) => a.expiry - b.expiry)
    .slice(0, BOUNTIES_KEPT);

  const workers = (input.floor ?? []).flatMap((w) => {
    const out = workerOf(w);
    return out ? [out] : [];
  });

  return {
    schema: 'agent-office/showcase@1',
    asOf: int(input.asOf) ?? 0,
    source: input.source === 'chain' ? 'chain' : 'office',
    network: { base: input.base === 'localnet' ? 'localnet' : 'base-sepolia', solana: input.solana === 'devnet' || input.solana === 'localnet' ? input.solana : 'none' },
    counters: {
      merged: external.length,
      usdcPaid: sumUnits(paid.map((e) => e.paid!)),
      paidSymbol: commonSymbol(paid.map((e) => e.paid!.symbol)),
      maintainers: new Set(external.flatMap((e) => (e.maintainer ? [e.maintainer] : []))).size,
      paidWorkers: new Set(paid.map((e) => e.agentId)).size,
      links: {
        ...(onBase && schemaUid ? { merged: EXPLORERS.easSchema(schemaUid), maintainers: EXPLORERS.easSchema(schemaUid) } : {}),
        ...(onDevnet && programId ? { usdcPaid: EXPLORERS.solanaAddress(programId), paidWorkers: EXPLORERS.solanaAddress(programId) } : {}),
      },
    },
    live: input.floor ? { at: int(input.floorAt) ?? int(input.asOf) ?? 0, workers: workers.slice(0, WORKERS_KEPT) } : null,
    events,
    agents,
    bounties,
    verify: {
      ...(programId ? { programId, ...(onDevnet ? { programUrl: EXPLORERS.solanaAddress(programId) } : {}) } : {}),
      ...(schemaUid ? { schemaUid, ...(onBase ? { schemaUrl: EXPLORERS.easSchema(schemaUid) } : {}) } : {}),
      ...(eas ? { eas } : {}),
      ...(identity ? { identity, ...(onBase ? { identityUrl: EXPLORERS.baseAddress(identity) } : {}) } : {}),
      ...(reputation ? { reputation, ...(onBase ? { reputationUrl: EXPLORERS.baseAddress(reputation) } : {}) } : {}),
      attesters,
      registrars,
      command: `cd onchain/indexer && npm install && npm run index -- --network ${input.base === 'localnet' ? 'localnet' : 'base-sepolia'}${attesters[0] ? ` --attester ${attesters[0]}` : ''} --out out/`,
    },
    credit: { ...UPSTREAM },
  };
}

/** The outcomes back as the reputation functions take them, so the page ranks exactly as the office does. */
export function asRepEvents(events: readonly ShowcaseEvent[], countSelf: boolean): RepEvent[] {
  return events.map((e) => ({
    agentId: e.agentId,
    harness: e.harness,
    repo: e.repo ?? 'redacted/redacted',
    pr: e.pr,
    outcome: e.outcome,
    at: e.at,
    ...(e.openedAt ? { openedAt: e.openedAt } : {}),
    ...(e.mergedAt ? { mergedAt: e.mergedAt } : {}),
    ...(e.maintainer ? { maintainer: e.maintainer } : {}),
    ...(e.self && !countSelf ? { self: true } : {}),
    ...(e.paid ? { paid: { amount: e.paid.amount, decimals: e.paid.decimals, tx: '', ...(e.paid.mint ? { mint: e.paid.mint } : {}) } } : {}),
    links: { ...e.links },
  }));
}
