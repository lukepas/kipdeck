/**
 * Durable nonces: a transaction whose "recent blockhash" is the value kept in a nonce account, and
 * whose first instruction advances that value. It stays valid until the nonce moves, not for the
 * minute or so a real blockhash lasts. That is what lets an attester sign a release now (in a CI job,
 * say) and an approver add the second signature hours later on their own machine.
 *
 * Only the nonce account's authority can advance it, so a release prepared on the approver's nonce
 * account can be sent by the approver and nobody else, and sending any one transaction on it makes
 * every other one prepared on the same value stale.
 */
import { SYSTEM_PROGRAM_ID, addressBytes, toAddress, type Address } from './keys.js';
import { concat, u64le } from './layout.js';
import type { Rpc } from './rpc.js';
import type { TxInstruction } from './tx.js';

export const RECENT_BLOCKHASHES_SYSVAR: Address = 'SysvarRecentB1ockHashes11111111111111111111';
export const RENT_SYSVAR: Address = 'SysvarRent111111111111111111111111111111111';
/** A nonce account's size: version, state, authority, the nonce, and the fee it was taken at. */
export const NONCE_ACCOUNT_LEN = 80;

/** What an initialized nonce account holds. */
export interface NonceState {
  /** Who may advance it (and withdraw from it). */
  authority: Address;
  /** The value a transaction uses as its blockhash. */
  nonce: string;
}

function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}

/** A nonce account's data, or undefined when it isn't an initialized one. */
export function decodeNonceAccount(data: Uint8Array): NonceState | undefined {
  if (data.length !== NONCE_ACCOUNT_LEN) return undefined;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // Version 0 (legacy) or 1 (current), then the state: 1 is Initialized.
  if (view.getUint32(0, true) > 1 || view.getUint32(4, true) !== 1) return undefined;
  return { authority: toAddress(data.subarray(8, 40)), nonce: toAddress(data.subarray(40, 72)) };
}

/** The nonce account at `address`, checked to be a System-owned, initialized one. */
export async function readNonceAccount(rpc: Rpc, address: Address): Promise<NonceState> {
  const account = await rpc.account(address);
  if (!account) throw new Error(`no nonce account at ${address}`);
  const state = account.owner === SYSTEM_PROGRAM_ID ? decodeNonceAccount(account.data) : undefined;
  if (!state) throw new Error(`${address} isn't an initialized nonce account`);
  return state;
}

/** System program AdvanceNonceAccount: must be a durable-nonce transaction's first instruction. */
export function buildAdvanceNonce(nonceAccount: Address, authority: Address): TxInstruction {
  return {
    programId: SYSTEM_PROGRAM_ID,
    keys: [
      { pubkey: nonceAccount, isSigner: false, isWritable: true },
      { pubkey: RECENT_BLOCKHASHES_SYSVAR, isSigner: false, isWritable: false },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data: u32le(4),
  };
}

/** Whether `ix` advances a nonce account, and if so which one, on whose authority. */
export function advancedNonce(ix: { programId: Address; accounts: Address[]; data: Uint8Array }): { nonceAccount: Address; authority: Address } | undefined {
  if (ix.programId !== SYSTEM_PROGRAM_ID || ix.data.length !== 4 || ix.accounts.length !== 3) return undefined;
  if (new DataView(ix.data.buffer, ix.data.byteOffset, 4).getUint32(0, true) !== 4 || ix.accounts[1] !== RECENT_BLOCKHASHES_SYSVAR) return undefined;
  return { nonceAccount: ix.accounts[0], authority: ix.accounts[2] };
}

/**
 * CreateAccount and InitializeNonceAccount: a new nonce account (which signs, as a new account must)
 * paid for by `payer`, advanced by `authority`. `lamports` must cover rent for 80 bytes. The Solana
 * CLI does the same with `solana create-nonce-account <file> <sol> --nonce-authority <authority>`.
 */
export function buildCreateNonceAccount(payer: Address, nonceAccount: Address, authority: Address, lamports: bigint): TxInstruction[] {
  return [
    {
      programId: SYSTEM_PROGRAM_ID,
      keys: [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: nonceAccount, isSigner: true, isWritable: true },
      ],
      data: concat(u32le(0), u64le(lamports), u64le(NONCE_ACCOUNT_LEN), addressBytes(SYSTEM_PROGRAM_ID)),
    },
    {
      programId: SYSTEM_PROGRAM_ID,
      keys: [
        { pubkey: nonceAccount, isSigner: false, isWritable: true },
        { pubkey: RECENT_BLOCKHASHES_SYSVAR, isSigner: false, isWritable: false },
        { pubkey: RENT_SYSVAR, isSigner: false, isWritable: false },
      ],
      data: concat(u32le(6), addressBytes(authority)),
    },
  ];
}
