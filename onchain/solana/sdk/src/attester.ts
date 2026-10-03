/**
 * The attester's side of a bounty: what must be true on GitHub before the office's key binds a pull
 * request to a bounty (Claim) or vouches for its merge (Release). The program can't see GitHub, so
 * these checks are what its attester signature means. The office gathers the facts (github.ts) and
 * the Attester refuses to sign unless every one holds.
 */
import type { Address } from './keys.js';
import type { ReleaseParams } from './layout.js';
import type { BountyEscrow, BountyRef, Receipt, Signer } from './types.js';

export type Permission = 'admin' | 'maintain' | 'write' | 'triage' | 'read' | 'none';

/** What GitHub says about a pull request, as far as paying for it goes. */
export interface PullFacts {
  /** "owner/name" of the base repository. */
  repo: string;
  number: number;
  /** Opened by an office worker from a branch the office made (not just named like one). */
  officeMade: boolean;
  /** The head branch lives in another repository than the base. */
  fork: boolean;
  /** The PR's body or its timeline links it as closing the bounty's issue. */
  closesIssue: boolean;
  merged: boolean;
  /** The merge commit. */
  mergeSha?: string;
  /** Who merged it, as GitHub reports the account. */
  mergedBy?: { login: string; id: number; type: string };
  /** The merger's permission on the base repository, as GitHub reports it. */
  mergerPermission?: Permission;
}

export type Verdict = { ok: true } | { ok: false; reason: string };

const no = (reason: string): Verdict => ({ ok: false, reason });

/** May the attester bind this PR to a bounty? It must be the office's own work on this repo, closing the issue. */
export function checkClaim(f: PullFacts): Verdict {
  if (f.fork) return no(`PR #${f.number} comes from a fork: only pull requests the office opened on the repository itself can claim a bounty`);
  if (!f.officeMade) return no(`PR #${f.number} wasn't opened by an office worker`);
  if (!f.closesIssue) return no(`PR #${f.number} doesn't close the bounty's issue`);
  if (!(f.number > 0)) return no('no pull request number');
  return { ok: true };
}

/**
 * May the attester vouch for this merge? Everything a claim needs, and merged, by a person (a User
 * account, never a Bot or an app) who has write access or more.
 */
export function checkRelease(f: PullFacts): Verdict {
  const claim = checkClaim(f);
  if (!claim.ok) return claim;
  if (!f.merged) return no(`PR #${f.number} isn't merged`);
  if (!f.mergeSha || !/^[0-9a-f]{40}$/i.test(f.mergeSha)) return no(`PR #${f.number} has no merge commit`);
  if (!f.mergedBy) return no(`GitHub doesn't say who merged PR #${f.number}`);
  if (f.mergedBy.type !== 'User') return no(`PR #${f.number} was merged by ${f.mergedBy.login}, a ${f.mergedBy.type} account: only a person's merge pays`);
  if (!['admin', 'maintain', 'write'].includes(f.mergerPermission ?? 'none')) return no(`${f.mergedBy.login} doesn't have write access to ${f.repo}`);
  return { ok: true };
}

export class AttestationRefused extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'AttestationRefused';
  }
}

export interface AttesterOptions {
  /**
   * The pseudonym Release records for whoever merged (hex, 32 bytes), from their GitHub user id:
   * mergedByHash(id, secret) with a secret the office keeps. Without it the merger is left out (zero).
   */
  pseudonym?: (githubUserId: number) => string;
}

/** The escrow, as the office's attester key uses it: every signature checked against GitHub's facts first. */
export class Attester {
  constructor(
    private escrow: BountyEscrow,
    private key: Signer,
    private opts: AttesterOptions = {},
  ) {}

  get address(): Address {
    return this.key.publicKey;
  }

  /** Binds the PR and the wallet to pay. Refused for a fork, a PR the office didn't make, or one that doesn't close the issue. */
  async claim(ref: BountyRef, facts: PullFacts, wallet: Address): Promise<Receipt> {
    const v = checkClaim(facts);
    if (!v.ok) throw new AttestationRefused(v.reason);
    return this.escrow.claim(ref, { prNumber: facts.number, wallet }, this.key);
  }

  /** What Release records for a merge GitHub vouched for. */
  releaseParams(facts: PullFacts): ReleaseParams {
    const v = checkRelease(facts);
    if (!v.ok) throw new AttestationRefused(v.reason);
    const by = this.opts.pseudonym?.(facts.mergedBy!.id);
    return { prNumber: facts.number, mergeSha: facts.mergeSha, ...(by ? { mergedByHash: by } : {}) };
  }

  /** Releases with the approver's signature. Refused unless a person with write access merged it. */
  async release(ref: BountyRef, facts: PullFacts, approver: Signer): Promise<Receipt> {
    return this.escrow.release(ref, this.releaseParams(facts), this.key, approver);
  }

  /**
   * The Release for an approver who signs in a browser wallet: checked like release(), signed by the
   * attester, with the approver's slot left for the wallet, which also pays the fee and sends it.
   * Base64. Only an escrow on a cluster can build one.
   */
  async prepareRelease(ref: BountyRef, facts: PullFacts, approver: Address): Promise<string> {
    const params = this.releaseParams(facts);
    const e = this.escrow as BountyEscrow & { prepareRelease?: (ref: BountyRef, params: ReleaseParams, attester: Signer, approver: Address) => Promise<string> };
    if (!e.prepareRelease) throw new Error(`${this.escrow.network} has no wallet to sign a release with`);
    return e.prepareRelease(ref, params, this.key, approver);
  }
}
