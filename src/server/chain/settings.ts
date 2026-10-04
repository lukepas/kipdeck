// Settings for Proof of Merge bounties: on or off (off until an admin turns it on), the mock or
// Solana devnet (there is no other cluster), the program, the mint, where the attester's and the
// approver's key files are, which repositories the public "Fund this issue" Action may fund, and
// each person's payout wallet. Kept in the office's data folder through the state-file helpers.
import os from 'node:os';
import path from 'node:path';
import type { ChainSettingsState } from '../../shared/protocol.js';
import { readStateJson, writeState } from '../safefs.js';

/** Where the office looks for its testnet keys unless told otherwise (mode 0700, files 0600). */
export const KEY_DIR = path.join(os.homedir(), '.config', 'agent-office-chain');

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const REPO = /^[\w.-]+\/[\w.-]+$/;
/** The account id payout wallets are kept under for whoever came in on the shared password. */
export const OFFICE_WALLET = 'office';

export interface ChainSaved {
  enabled: boolean;
  backend: 'mock' | 'solana-devnet';
  programId?: string;
  mint?: string;
  attesterKey: string;
  approverKey: string;
  /**
   * The approver as a browser wallet's address: an admin signs each payout in that wallet, and no
   * approver key sits on this machine, where an agent could read it. Takes the place of approverKey.
   */
  approverWallet?: string;
  actionRepos: string[];
  /** Whether the public Action shows the issue's title (off: just owner/name#N, for a private repository's issues). */
  actionTitles: boolean;
  expiryDays: number;
  /** By account id (OFFICE_WALLET for the shared password). */
  wallets: Record<string, string>;
  by?: string;
  at?: number;
}

export function defaultChain(): ChainSaved {
  return { enabled: false, backend: 'solana-devnet', attesterKey: path.join(KEY_DIR, 'solana-attester.json'), approverKey: path.join(KEY_DIR, 'solana-approver.json'), actionRepos: [], actionTitles: false, expiryDays: 30, wallets: {} };
}

/** A key file path as given: absolute, no control characters, at most 1024 characters. */
function keyPath(v: unknown): string | undefined {
  return typeof v === 'string' && path.isAbsolute(v) && v.length <= 1024 && !/[\0-\x1f]/.test(v) ? v : undefined;
}

/** Settings as read back or sent: anything that doesn't fit is left as it was. */
export function cleanChain(raw: unknown, base: ChainSaved = defaultChain()): ChainSaved {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out: ChainSaved = { ...base, wallets: { ...base.wallets }, actionRepos: [...base.actionRepos] };
  if (typeof r.enabled === 'boolean') out.enabled = r.enabled;
  if (typeof r.actionTitles === 'boolean') out.actionTitles = r.actionTitles;
  if (r.backend === 'mock' || r.backend === 'solana-devnet') out.backend = r.backend;
  for (const k of ['programId', 'mint', 'approverWallet'] as const) {
    if (r[k] === null || r[k] === '') delete out[k];
    else if (typeof r[k] === 'string' && BASE58.test(r[k] as string)) out[k] = r[k] as string;
  }
  out.attesterKey = keyPath(r.attesterKey) ?? out.attesterKey;
  out.approverKey = keyPath(r.approverKey) ?? out.approverKey;
  if (Array.isArray(r.actionRepos)) out.actionRepos = [...new Set(r.actionRepos.filter((x): x is string => typeof x === 'string' && REPO.test(x)).map((x) => x.toLowerCase()))].slice(0, 50);
  if (Number.isInteger(r.expiryDays) && (r.expiryDays as number) >= 1 && (r.expiryDays as number) <= 365) out.expiryDays = r.expiryDays as number;
  if (r.wallets && typeof r.wallets === 'object') {
    out.wallets = {};
    for (const [id, a] of Object.entries(r.wallets as Record<string, unknown>)) if (/^[\w-]{1,32}$/.test(id) && typeof a === 'string' && BASE58.test(a)) out.wallets[id] = a;
  }
  if (typeof r.by === 'string') out.by = r.by.slice(0, 64);
  if (typeof r.at === 'number' && Number.isFinite(r.at)) out.at = r.at;
  return out;
}

export class ChainSettings {
  private saved: ChainSaved;
  private file: string;

  constructor(
    dataDir: string,
    private onChange: () => void = () => {},
  ) {
    this.file = path.join(dataDir, 'chain.json');
    let raw: unknown;
    try {
      raw = readStateJson(this.file);
    } catch {
      // a broken file means the defaults: off
    }
    this.saved = cleanChain(raw);
  }

  get(): ChainSaved {
    return structuredClone(this.saved);
  }

  /** What Settings shows `accountId`: everything but the other people's wallets. */
  state(accountId: string | undefined, keys: { attester?: string; approver?: string } = {}): ChainSettingsState {
    const s = this.saved;
    const mine = s.wallets[accountId ?? OFFICE_WALLET];
    return {
      enabled: s.enabled,
      backend: s.backend,
      cluster: 'devnet',
      ...(s.programId ? { programId: s.programId } : {}),
      ...(s.mint ? { mint: s.mint } : {}),
      attesterKey: s.attesterKey,
      approverKey: s.approverKey,
      ...(s.approverWallet ? { approverWallet: s.approverWallet } : {}),
      ...keys,
      actionRepos: [...s.actionRepos],
      actionTitles: s.actionTitles,
      expiryDays: s.expiryDays,
      ...(mine ? { myWallet: mine } : {}),
    };
  }

  /** Admins' changes. */
  set(patch: unknown, by: string) {
    const p = { ...((patch ?? {}) as Record<string, unknown>) };
    delete p.wallets;
    this.saved = cleanChain({ ...p, by, at: Date.now() }, this.saved);
    this.save();
  }

  /** Someone's own payout wallet. Why not, if it isn't one. */
  setWallet(accountId: string | undefined, address: string | null, isAddress: (a: string) => boolean): string | undefined {
    const id = accountId ?? OFFICE_WALLET;
    if (address === null) delete this.saved.wallets[id];
    else if (typeof address !== 'string' || !BASE58.test(address) || !isAddress(address)) return "That isn't a Solana address";
    else this.saved.wallets[id] = address;
    // A wallet changes nothing about the escrow: no setting up again.
    this.save(false);
    return undefined;
  }

  wallet(accountId: string | undefined): string | undefined {
    return this.saved.wallets[accountId ?? OFFICE_WALLET];
  }

  private save(changed = true) {
    try {
      writeState(this.file, JSON.stringify(this.saved, null, 2));
    } catch {
      // disk issues shouldn't take the office down
    }
    if (changed) this.onChange();
  }
}
