// Proof of Merge bounties: devnet USDC escrowed against a floor's GitHub issues, paid to the agent
// operator only when a person merges the office's pull request for the issue and an office admin
// approves. The escrow is a Solana program (onchain/solana); this is what the office says about it.

/** Where a bounty is, as the office sees it: the program's states, plus the office's own steps between them. */
export type BountyPhase =
  | 'open'
  | 'claimed'
  /** The claimed PR merged and GitHub says a person with write access merged it: waits for an admin. */
  | 'awaiting-approval'
  /** The claimed PR merged, but it doesn't count (a bot merged it, say): `blocked` says why. */
  | 'blocked'
  | 'paying'
  | 'released'
  | 'refunded'
  | 'cancelled'
  | 'expired';

export type BountyTxKind = 'funded' | 'claimed' | 'paid' | 'refunded' | 'cancelled';

/** A transaction the office saw or sent for a bounty. */
export interface BountyTx {
  kind: BountyTxKind;
  /** The transaction signature (base58), or a mock one. */
  sig: string;
  at: number;
  /** An explorer link, devnet only (none on the mock). */
  url?: string;
}

/** One bounty on one of the floor's issues. Amounts are in the token's base units, as strings (u64). */
export interface BountyView {
  issue: number;
  nonce: number;
  /** The bounty account's address. */
  pda: string;
  amount: string;
  decimals: number;
  symbol: string;
  funders: number;
  /** Unix ms. */
  expiry: number;
  phase: BountyPhase;
  /** The office PR it's bound to, once claimed, and the worker who made it, when known. */
  claimPr?: number;
  workerId?: string;
  workerName?: string;
  /** Why it's blocked, or why a claim is waiting (no payout wallet set, say). */
  note?: string;
  /** Once merged and checked: who merged, for the approval line. */
  mergedBy?: string;
  txs: BountyTx[];
  /** An explorer link for the bounty account. */
  url?: string;
}

/** What a floor's bounties look like to the people on it. */
export interface BountiesState {
  /** chain.enabled in ⚙️ Settings: off until an admin turns it on. */
  enabled: boolean;
  /** "solana-devnet" or "mock". Never a mainnet. */
  network: string;
  programId?: string;
  items: BountyView[];
  /** The floor's repository, "owner/name" lowercased, once GitHub said. */
  repo?: string;
  /** Whether this floor's repository takes funding from the public "Fund this issue" Action. */
  blink: boolean;
  error?: string;
}

/** ⚙️ Settings for bounties (admins): kept in the office's data folder. */
export interface ChainSettingsState {
  enabled: boolean;
  backend: 'mock' | 'solana-devnet';
  /** Always devnet: there is no other Solana cluster to pick. */
  cluster: 'devnet';
  programId?: string;
  mint?: string;
  /** Key files on the office's machine (never the keys themselves). */
  attesterKey: string;
  approverKey: string;
  /** The approver as an admin's browser wallet (no approver key on the office's machine): releases are signed there. */
  approverWallet?: string;
  /** The attester's and approver's public addresses, once their key files read. */
  attester?: string;
  approver?: string;
  /** owner/name of repositories whose issues the public Action may fund. */
  actionRepos: string[];
  /** Whether the public Action shows issue titles (off for a private repository). */
  actionTitles: boolean;
  expiryDays: number;
  /** Your own payout wallet (a Solana address), if you set one. */
  myWallet?: string;
}

export type BountiesClientMsg =
  /** This floor's bounties, again (answered with `bounties`). */
  | { t: 'bounty.list' }
  /**
   * A transaction for your browser wallet to sign that opens issue `issue`'s bounty if needed and
   * funds it with `amount` whole tokens from `wallet`; answered with `bounty.prepared`.
   */
  | { t: 'bounty.fund.prepare'; issue: number; amount: string; wallet: string }
  /** Admins: approve the payout of a bounty waiting for approval. Answered with `bounty.approved`. */
  | { t: 'bounty.approve'; issue: number; floor?: string }
  /** Admins: the approver's wallet sent the release `bounty.approved` handed it; look at the chain again. */
  | { t: 'bounty.release.sent'; issue: number; floor?: string; sig?: string }
  /** Admins: crank an expired bounty's contributions back to their funders (the attester pays the fees). */
  | { t: 'bounty.refund'; issue: number; floor?: string }
  /** Your payout wallet, for bounties your workers' PRs earn (null: forget it). */
  | { t: 'bounty.wallet'; address: string | null }
  /** Admins: change the bounty settings. */
  | { t: 'bounty.settings'; patch: Partial<Pick<ChainSettingsState, 'enabled' | 'backend' | 'programId' | 'mint' | 'attesterKey' | 'approverKey' | 'approverWallet' | 'actionRepos' | 'actionTitles' | 'expiryDays'>> }
  /** The settings, for ⚙️ Settings (answered with `bounty.settings`). */
  | { t: 'bounty.settings.get' };

export type BountiesServerMsg =
  | { t: 'bounties'; floor: string; state: BountiesState }
  /** To whoever asked: the base64 transaction for their wallet, the Blink link, or why not. */
  | { t: 'bounty.prepared'; issue: number; tx?: string; blink?: string; error?: string }
  /**
   * To whoever approved: the payout's signature and link, or why it didn't go. With an approver
   * wallet, `tx` instead: the release the attester signed, for that wallet (`approver`) to sign and send.
   */
  | { t: 'bounty.approved'; issue: number; floor?: string; sig?: string; url?: string; error?: string; tx?: string; approver?: string }
  /** To everyone on the floor: a bounty paid out. */
  | { t: 'bounty.paid'; floor: string; issue: number; pr: number; amount: string; symbol: string; workerName?: string; url?: string }
  | { t: 'bounty.settings'; state: ChainSettingsState };
