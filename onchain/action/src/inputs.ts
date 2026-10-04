// The action's inputs, as GitHub hands them over (INPUT_<NAME> environment variables), checked and
// typed. Keys arrive as GitHub encrypted secrets only; they are masked in the log before anything
// else happens, and no error message ever quotes one.
import { keypairFromSecretKey, isAddress, decodeBase58, type Keypair, type Address } from '../../solana/sdk/src/index.js';
import solanaDevnet from '../../solana/deployments/devnet.json' with { type: 'json' };
import baseSepolia from '../../attest/deployments/base-sepolia.json' with { type: 'json' };

export type Env = Record<string, string | undefined>;
export type Mode = 'auto' | 'claim' | 'release';
export const MODES: readonly Mode[] = ['auto', 'claim', 'release'];

/** The escrow this repository's bounties live in, and the keys that act on them. */
export interface Inputs {
  githubToken: string;
  programId: Address;
  cluster: 'devnet' | 'localnet';
  /** Empty for devnet's public RPC. */
  rpcUrl?: string;
  /** Only bounties in this mint count (default: any mint the program accepts). */
  mint?: Address;
  /** The approver's address: part of every bounty's address, so it is needed even to find them. */
  approver: Address;
  mode: Mode;
  /** Who merged, kept on chain as HMAC-SHA256 of their GitHub id under this secret; left out without it. */
  mergedBySecret?: string;
  /** A login-to-wallet map in the repository (read at the base branch). */
  walletsFile: string;
  /** Whether a "Bounty-Wallet: <address>" line in the pull request body may name the wallet. */
  walletFromBody: boolean;
  comment: boolean;
  /** workflow_dispatch: the pull request to look at again. */
  prNumber?: number;
  /** A durable nonce account the approver is the authority of: releases are prepared on it. */
  approverNonceAccount?: Address;
  base?: { rpcUrl: string; schemaUid: `0x${string}`; harness: string };
  /** Read lazily, after the pull request passed every check, so a fork's run never needs them. */
  secrets: {
    attesterKey(): Keypair;
    approverKey(): Keypair | undefined;
    baseAttesterKey(): `0x${string}` | undefined;
  };
}

export const DEFAULT_PROGRAM_ID = solanaDevnet.programId;
export const DEFAULT_SCHEMA_UID = baseSepolia.schemaUid as `0x${string}`;
export const DEFAULT_BASE_RPC = 'https://sepolia.base.org';

export class InputError extends Error {}

/** What getInput in @actions/core reads: INPUT_ and the name in capitals, spaces as underscores. */
export function input(env: Env, name: string): string {
  return (env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] ?? '').trim();
}

function bool(env: Env, name: string, fallback: boolean): boolean {
  const v = input(env, name).toLowerCase();
  if (!v) return fallback;
  if (v === 'true') return true;
  if (v === 'false') return false;
  throw new InputError(`${name} is true or false, not ${JSON.stringify(v)}`);
}

function address(env: Env, name: string, required: true): Address;
function address(env: Env, name: string, required?: false): Address | undefined;
function address(env: Env, name: string, required = false): Address | undefined {
  const v = input(env, name);
  if (!v) {
    if (required) throw new InputError(`${name} is needed`);
    return undefined;
  }
  if (!isAddress(v)) throw new InputError(`${name} isn't a Solana address`);
  return v;
}

/**
 * A Solana keypair from a secret: the JSON array `solana-keygen` writes (64 numbers), or the same 64
 * bytes in base58 as wallets export them. The error never quotes the value.
 */
export function parseSolanaKey(name: string, value: string): Keypair {
  let bytes: Uint8Array | undefined;
  const v = value.trim();
  if (v.startsWith('[')) {
    try {
      const raw: unknown = JSON.parse(v);
      if (Array.isArray(raw) && raw.length === 64 && raw.every((n) => Number.isInteger(n) && n >= 0 && n < 256)) bytes = Uint8Array.from(raw as number[]);
    } catch {
      // not JSON: said below, without the value
    }
  } else {
    try {
      const b = decodeBase58(v);
      if (b.length === 64) bytes = b;
    } catch {
      // not base58 either
    }
  }
  if (!bytes) throw new InputError(`${name} isn't a Solana keypair (a JSON array of 64 numbers, or 64 bytes in base58)`);
  try {
    return keypairFromSecretKey(bytes);
  } catch {
    throw new InputError(`${name} isn't a valid Solana keypair`);
  }
}

/** An EVM private key from a secret: 32 bytes of hex, with or without 0x. */
export function parseEvmKey(name: string, value: string): `0x${string}` {
  const v = value.trim();
  const hex = v.startsWith('0x') ? v : `0x${v}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) throw new InputError(`${name} isn't an EVM private key (32 bytes of hex)`);
  return hex as `0x${string}`;
}

/** The workflow command that hides a value in the rest of the log. */
export function maskCommand(value: string): string {
  return `::add-mask::${value}`;
}

/** Reads and checks every input. `log` gets the mask commands for the secrets, before anything else. */
export function readInputs(env: Env, log: (line: string) => void): Inputs {
  for (const name of ['attester-key', 'approver-key', 'base-attester-key', 'merged-by-secret']) {
    const v = input(env, name);
    if (v) log(maskCommand(v));
  }
  const cluster = input(env, 'cluster') || 'devnet';
  if (cluster !== 'devnet' && cluster !== 'localnet') throw new InputError(`cluster is devnet or localnet (testnets only), not ${JSON.stringify(cluster)}`);
  const mode = (input(env, 'mode') || 'auto') as Mode;
  if (!MODES.includes(mode)) throw new InputError(`mode is one of ${MODES.join(', ')}`);
  const programId = address(env, 'program-id') ?? DEFAULT_PROGRAM_ID;
  const mergedBySecret = input(env, 'merged-by-secret') || undefined;
  if (mergedBySecret && new TextEncoder().encode(mergedBySecret).length < 16) throw new InputError('merged-by-secret must be at least 16 bytes');
  const pr = input(env, 'pr-number');
  const prNumber = pr ? Number(pr) : undefined;
  if (prNumber !== undefined && !(Number.isSafeInteger(prNumber) && prNumber > 0)) throw new InputError('pr-number is a pull request number');
  const githubToken = input(env, 'github-token');
  if (!githubToken) throw new InputError('github-token is needed (the default, github.token, is enough)');
  const walletsFile = input(env, 'wallets-file') || '.github/bounty-wallets.json';
  if (walletsFile.startsWith('/') || walletsFile.split('/').includes('..')) throw new InputError('wallets-file is a path inside the repository');
  const harness = input(env, 'harness') || 'unknown';
  if (!/^[a-z0-9_-]{1,32}$/.test(harness)) throw new InputError('harness is a short lower-case name');
  const schemaUid = (input(env, 'base-schema-uid') || DEFAULT_SCHEMA_UID) as `0x${string}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(schemaUid)) throw new InputError('base-schema-uid is 32 bytes of hex');
  const baseKey = input(env, 'base-attester-key');
  return {
    githubToken,
    programId,
    cluster,
    rpcUrl: input(env, 'rpc-url') || undefined,
    mint: address(env, 'mint'),
    approver: address(env, 'approver', true),
    mode,
    mergedBySecret,
    walletsFile,
    walletFromBody: bool(env, 'wallet-from-body', true),
    comment: bool(env, 'comment', true),
    prNumber,
    approverNonceAccount: address(env, 'approver-nonce-account'),
    ...(baseKey ? { base: { rpcUrl: input(env, 'base-rpc-url') || DEFAULT_BASE_RPC, schemaUid, harness } } : {}),
    secrets: {
      attesterKey: () => {
        const v = input(env, 'attester-key');
        if (!v) throw new InputError('attester-key is empty: add the attester keypair as an encrypted secret and pass it in');
        return parseSolanaKey('attester-key', v);
      },
      approverKey: () => {
        const v = input(env, 'approver-key');
        return v ? parseSolanaKey('approver-key', v) : undefined;
      },
      baseAttesterKey: () => (baseKey ? parseEvmKey('base-attester-key', baseKey) : undefined),
    },
  };
}
