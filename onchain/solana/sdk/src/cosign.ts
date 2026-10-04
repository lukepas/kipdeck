/**
 * The approver's side of a release the attester prepared somewhere else (the GitHub Action, say):
 * read it back, check it is exactly the Release the bounty on chain allows and nothing more, then add
 * the approver's signature and send it. Nothing in the transaction is taken on trust: the bounty is
 * read from the cluster and the expected instruction is rebuilt from it, byte for byte.
 */
import { BOUNTY_LEN, decodeBounty, hexOf, repoHash, type BountyAccount } from './layout.js';
import { buildRelease } from './builders.js';
import { encodeBase58 } from './base58.js';
import { signBytes, verifySignature, type Address, type Keypair } from './keys.js';
import * as machine from './machine.js';
import { advancedNonce, readNonceAccount } from './nonce.js';
import type { SolanaEscrow } from './solana.js';
import { compactU16, decodeTransaction, messageSigners } from './tx.js';
import type { Receipt } from './types.js';

/** What a prepared release would do, once the approver signs it. */
export interface PreparedRelease {
  bounty: BountyAccount & { address: Address };
  /** What it pays: the whole vault, in base units. */
  amount: bigint;
  prNumber: number;
  /** The claimed wallet it pays. */
  claimant: Address;
  mergeSha?: string;
  mergedByHash?: string;
  attester: Address;
  approver: Address;
  /** The durable nonce it waits on; undefined for one built on an ordinary (short-lived) blockhash. */
  nonceAccount?: Address;
}

const ZERO_SIG = new Uint8Array(64);
const isZero = (b: Uint8Array) => b.every((x) => x === 0);

/** Release's data: tag 3, the merge commit (20), the merger's hash (32), the PR number (u64 LE). */
function decodeReleaseData(data: Uint8Array): { prNumber: number; mergeSha?: string; mergedByHash?: string } | undefined {
  if (data.length !== 61 || data[0] !== 3) return undefined;
  const sha = data.subarray(1, 21);
  const by = data.subarray(21, 53);
  const pr = new DataView(data.buffer, data.byteOffset + 53, 8).getBigUint64(0, true);
  if (pr > BigInt(Number.MAX_SAFE_INTEGER)) return undefined;
  return { prNumber: Number(pr), ...(isZero(sha) ? {} : { mergeSha: hexOf(sha) }), ...(isZero(by) ? {} : { mergedByHash: hexOf(by) }) };
}

/**
 * Checks a prepared release (base64) against the cluster and says what it would pay. Refuses one
 * that isn't a single Release of this program (after an optional AdvanceNonceAccount), one whose
 * accounts or data differ from what the bounty on chain calls for, one the attester didn't sign, one
 * that needs any signer but the bounty's attester and approver, one whose nonce has moved on, and one
 * the program would refuse now. With `repo`, also one for a bounty on another repository.
 */
export async function inspectPreparedRelease(escrow: SolanaEscrow, base64: string, opts: { repo?: string } = {}): Promise<PreparedRelease> {
  let tx: ReturnType<typeof decodeTransaction>;
  try {
    tx = decodeTransaction(new Uint8Array(Buffer.from(base64.trim(), 'base64')));
  } catch {
    throw new Error("that isn't a Solana transaction (base64)");
  }
  if (tx.signatures.length !== tx.header[0]) throw new Error('the transaction has the wrong number of signature slots');
  let nonce: { nonceAccount: Address; authority: Address } | undefined;
  let ixs = tx.instructions;
  if (ixs.length === 2) {
    nonce = advancedNonce(ixs[0]);
    if (!nonce) throw new Error('the first of two instructions must advance a durable nonce');
    ixs = ixs.slice(1);
  }
  if (ixs.length !== 1) throw new Error('a prepared release holds one Release instruction and nothing else');
  const [rel] = ixs;
  if (rel.programId !== escrow.programId) throw new Error(`the instruction is for ${rel.programId}, not the escrow ${escrow.programId}`);
  const params = decodeReleaseData(rel.data);
  if (!params) throw new Error("the instruction isn't a Release");
  const address = rel.accounts[3];
  const account = address ? await escrow.rpc.account(address) : undefined;
  if (!account || account.owner !== escrow.programId || account.data.length !== BOUNTY_LEN) throw new Error(`no bounty of this program at ${address}`);
  const b = { ...decodeBounty(account.data), address };
  if (opts.repo && b.repoHash !== hexOf(repoHash(opts.repo))) throw new Error(`the bounty at ${address} isn't on ${opts.repo}`);
  if (b.state !== 'claimed' || !b.claimantWallet) throw new Error(`the bounty is ${b.state}, not claimed: there is nothing to release`);
  const feePayer = tx.accounts[0];
  if (feePayer !== b.approver) throw new Error(`the fee payer is ${feePayer}, not the bounty's approver ${b.approver}`);
  const want = buildRelease({ programId: escrow.programId, payer: feePayer, attester: b.attester, approver: b.approver, bounty: address, mint: b.mint, wallet: b.claimantWallet, ...params });
  if (want.keys.length !== rel.accounts.length || want.keys.some((k, i) => k.pubkey !== rel.accounts[i])) throw new Error("the Release's accounts aren't the ones this bounty pays through");
  if (!Buffer.from(want.data).equals(Buffer.from(rel.data))) throw new Error("the Release's data doesn't match");
  const signers = messageSigners(tx.message);
  if (signers.some((s) => s !== b.attester && s !== b.approver)) throw new Error('the transaction wants a signature from someone other than the attester and the approver');
  const at = signers.indexOf(b.attester);
  if (at < 0 || isZero(tx.signatures[at]) || !verifySignature(b.attester, tx.message, tx.signatures[at])) throw new Error("the bounty's attester hasn't signed it");
  if (nonce) {
    if (nonce.authority !== b.approver) throw new Error(`the nonce is advanced by ${nonce.authority}, not the approver`);
    const state = await readNonceAccount(escrow.rpc, nonce.nonceAccount);
    if (state.authority !== b.approver) throw new Error(`the nonce account ${nonce.nonceAccount} now belongs to ${state.authority}`);
    if (state.nonce !== tx.blockhash) throw new Error('the nonce has moved on since this release was prepared (another transaction used it): prepare it again');
  }
  const [now, vault] = await Promise.all([escrow.now(), escrow.rpc.account(b.vault)]);
  const held = vault && vault.data.length === 165 ? new DataView(vault.data.buffer, vault.data.byteOffset).getBigUint64(64, true) : 0n;
  const amount = machine.release({ ...b }, { attester: b.attester, approver: b.approver, prNumber: params.prNumber, mergeSha: params.mergeSha, mergedByHash: params.mergedByHash, vault: held }, now);
  return { bounty: b, amount, prNumber: params.prNumber, claimant: b.claimantWallet, mergeSha: params.mergeSha, mergedByHash: params.mergedByHash, attester: b.attester, approver: b.approver, ...(nonce ? { nonceAccount: nonce.nonceAccount } : {}) };
}

/**
 * Inspects a prepared release, then signs it as the approver (who also pays the fee) and sends it.
 * `check` sees what it would pay first and may throw to stop it.
 */
export async function cosignRelease(escrow: SolanaEscrow, base64: string, approver: Keypair, opts: { repo?: string; check?: (r: PreparedRelease) => void } = {}): Promise<Receipt & { release: PreparedRelease }> {
  const release = await inspectPreparedRelease(escrow, base64, opts);
  if (approver.publicKey !== release.approver) throw new Error(`this key is ${approver.publicKey}, not the bounty's approver ${release.approver}`);
  opts.check?.(release);
  const tx = decodeTransaction(new Uint8Array(Buffer.from(base64.trim(), 'base64')));
  const signers = messageSigners(tx.message);
  const sigs = signers.map((who, i) => (who === approver.publicKey ? signBytes(approver, tx.message) : tx.signatures[i] ?? ZERO_SIG));
  const wire = Uint8Array.from([...compactU16(sigs.length), ...sigs.flatMap((s) => [...s]), ...tx.message]);
  // A durable-nonce transaction has no block height to expire at; one on a blockhash does, but the
  // RPC refuses it outright once that blockhash is gone, so the confirm timeout bounds both.
  const sent = await escrow.sendSigned(wire, encodeBase58(sigs[0]));
  const b = release.bounty;
  // The bounty only names its repository by hash, so it is read back by name when the caller gave one.
  const after = opts.repo ? await escrow.get({ repo: opts.repo, issue: b.issue, nonce: b.nonce, attester: b.attester, approver: b.approver }) : undefined;
  return { ...sent, ...(after ? { bounty: after } : {}), release };
}
