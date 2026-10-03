// The command-line switches for the Base side of Proof of Merge, both off unless given:
//
//   --x402 ...    paid tasks: someone outside the office pays test USDC over x402 to put a task on a
//                 floor's queue, held for an admin (see server/x402/)
//   --attest ...  proof-of-merge attestations on Base Sepolia for every office PR a person merged
//                 (see chain/attest.ts)
//   --reputation  ERC-8004 identities for the office's agents and feedback for each attested outcome
//                 (see chain/reputation.ts); needs --attest, whose key gives the feedback
//
// Testnets only: Base Sepolia and Solana devnet. Keys are named by file path, never passed as values.
import path from 'node:path';
import { KEY_DIR } from './settings.js';

export interface X402Flags {
  enabled: boolean;
  /** The office's receiving address on Base Sepolia. */
  payTo?: string;
  /** Its receiving address on Solana devnet, to take devnet USDC too. */
  payToSolana?: string;
  /** Dollars per task. */
  price: string;
  /** Repositories (owner/name) paid tasks may be for. */
  repos: string[];
  facilitator: string;
  /** A test ERC-20 standing in for Circle's USDC on Base Sepolia (TestUSDC). */
  asset?: string;
}

export interface AttestFlags {
  enabled: boolean;
  keyFile: string;
  rpc: string;
  /** The schema UID (default: onchain/attest/deployments/base-sepolia.json). */
  schema?: string;
  /** 'eas' (default) or 'event' (the MergeAttestor fallback, at `contract`). */
  mode: 'eas' | 'event';
  contract?: string;
  /** EAS, when not the Base predeploy (a local test chain). */
  eas?: string;
}

export interface ReputationFlags {
  enabled: boolean;
  /** Registers the office's agents and owns their identities (never the key that gives feedback). */
  registrarKeyFile: string;
  /** The registries, when not the live ERC-8004 ones on Base Sepolia (a local test chain). */
  identity?: string;
  registry?: string;
  /** Where agent cards are served from (https://office.example): each identity's agentURI is <base>/agents/<id>.json. */
  cardBase?: string;
  /** Minutes between runs of onchain/indexer rebuilding the board from the chain (0: never). */
  indexMinutes: number;
}

export interface ChainFlags {
  x402: X402Flags;
  attest: AttestFlags;
  reputation: ReputationFlags;
}

export const X402_FACILITATOR = 'https://x402.org/facilitator';
/** The Base Sepolia RPCs the office may sign attestations through. */
export const BASE_SEPOLIA_RPCS = ['https://sepolia.base.org', 'https://base-sepolia-rpc.publicnode.com'];

const on = (v: string | undefined) => !!v && v !== '0' && v.toLowerCase() !== 'false';
const list = (v: string | undefined) => (v ?? '').split(/[\s,]+/).filter(Boolean);

/** The defaults, with whatever the environment says (AGENT_OFFICE_X402=1, AGENT_OFFICE_ATTEST=1 ...). */
export function chainFlagsFromEnv(env: NodeJS.ProcessEnv = process.env): ChainFlags {
  return {
    x402: {
      enabled: on(env.AGENT_OFFICE_X402),
      ...(env.AGENT_OFFICE_X402_PAY_TO ? { payTo: env.AGENT_OFFICE_X402_PAY_TO } : {}),
      ...(env.AGENT_OFFICE_X402_PAY_TO_SOLANA ? { payToSolana: env.AGENT_OFFICE_X402_PAY_TO_SOLANA } : {}),
      price: env.AGENT_OFFICE_X402_PRICE || '0.10',
      repos: list(env.AGENT_OFFICE_X402_REPOS),
      facilitator: env.AGENT_OFFICE_X402_FACILITATOR || X402_FACILITATOR,
      ...(env.AGENT_OFFICE_X402_ASSET ? { asset: env.AGENT_OFFICE_X402_ASSET } : {}),
    },
    attest: {
      enabled: on(env.AGENT_OFFICE_ATTEST),
      keyFile: env.AGENT_OFFICE_ATTEST_KEY_FILE || path.join(KEY_DIR, 'base-attester.json'),
      rpc: env.AGENT_OFFICE_ATTEST_RPC || BASE_SEPOLIA_RPCS[0],
      ...(env.AGENT_OFFICE_ATTEST_SCHEMA ? { schema: env.AGENT_OFFICE_ATTEST_SCHEMA } : {}),
      mode: env.AGENT_OFFICE_ATTEST_MODE === 'event' ? 'event' : 'eas',
      ...(env.AGENT_OFFICE_ATTEST_CONTRACT ? { contract: env.AGENT_OFFICE_ATTEST_CONTRACT } : {}),
    },
    reputation: {
      enabled: on(env.AGENT_OFFICE_REPUTATION),
      registrarKeyFile: env.AGENT_OFFICE_REPUTATION_REGISTRAR_KEY_FILE || path.join(KEY_DIR, 'base-registrar.json'),
      ...(env.AGENT_OFFICE_REPUTATION_CARD_BASE ? { cardBase: env.AGENT_OFFICE_REPUTATION_CARD_BASE } : {}),
      indexMinutes: Number(env.AGENT_OFFICE_REPUTATION_INDEX_MINUTES) || 0,
    },
  };
}

/** Flags that take a value, and what each sets. */
const VALUED: Record<string, (f: ChainFlags, v: string) => void> = {
  '--x402-pay-to': (f, v) => void (f.x402.payTo = v),
  '--x402-pay-to-solana': (f, v) => void (f.x402.payToSolana = v),
  '--x402-price': (f, v) => void (f.x402.price = v),
  '--x402-repos': (f, v) => void f.x402.repos.push(...list(v)),
  '--x402-facilitator': (f, v) => void (f.x402.facilitator = v),
  '--x402-asset': (f, v) => void (f.x402.asset = v),
  '--attest-key-file': (f, v) => void (f.attest.keyFile = v),
  '--attest-rpc': (f, v) => void (f.attest.rpc = v),
  '--attest-schema': (f, v) => void (f.attest.schema = v),
  '--attest-mode': (f, v) => void (f.attest.mode = v === 'event' ? 'event' : 'eas'),
  '--attest-contract': (f, v) => void (f.attest.contract = v),
  '--attest-eas': (f, v) => void (f.attest.eas = v),
  '--reputation-registrar-key-file': (f, v) => void (f.reputation.registrarKeyFile = v),
  '--reputation-identity': (f, v) => void (f.reputation.identity = v),
  '--reputation-registry': (f, v) => void (f.reputation.registry = v),
  '--reputation-card-base': (f, v) => void (f.reputation.cardBase = v),
  '--reputation-index': (f, v) => void (f.reputation.indexMinutes = Number(v)),
};

/**
 * Takes `argv[i]` if it's one of these switches: returns how many arguments it used (1 or 2), or 0
 * when it isn't one. A string is what's wrong with it.
 */
export function takeChainFlag(f: ChainFlags, argv: string[], i: number): number | string {
  const a = argv[i];
  if (a === '--x402') return (f.x402.enabled = true), 1;
  if (a === '--attest') return (f.attest.enabled = true), 1;
  if (a === '--reputation') return (f.reputation.enabled = true), 1;
  const set = VALUED[a];
  if (!set) return 0;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) return `${a} needs a value`;
  set(f, v);
  return 2;
}

export const CHAIN_HELP = `      --x402              Take paid tasks over x402 (testnets only, env
                          AGENT_OFFICE_X402=1): POST /api/x402/task puts a task
                          on a floor's queue, held until an admin approves it
      --x402-pay-to <0x>  The office's Base Sepolia address paid tasks pay to
      --x402-pay-to-solana <addr>
                          ...and its Solana devnet address, to take devnet USDC too
      --x402-repos <list> owner/name repositories paid tasks may be for (required)
      --x402-price <usd>  Per task, in test USDC (default 0.10)
      --x402-facilitator <url>
                          Verifies and settles payments (default x402.org's)
      --x402-asset <0x>   A test token standing in for Circle's Base Sepolia USDC
      --attest            Attest every office PR a person merges on Base Sepolia
                          (EAS; env AGENT_OFFICE_ATTEST=1)
      --attest-key-file <path>
                          The attester's key file (default
                          ~/.config/agent-office-chain/base-attester.json)
      --attest-rpc <url>  https://sepolia.base.org (default),
                          https://base-sepolia-rpc.publicnode.com, or a local
                          node on 127.0.0.1 run with --chain-id 84532 (with
                          --attest-eas <0x> where EAS was deployed there)
      --attest-schema <uid>
                          The schema UID (default: onchain/attest/deployments)
      --attest-mode eas|event, --attest-contract <0x>
                          The MergeAttestor fallback instead of EAS
      --reputation        ERC-8004 identities for the office's agents, and
                          feedback for every attested merge, revert or close
                          (needs --attest; env AGENT_OFFICE_REPUTATION=1)
      --reputation-registrar-key-file <path>
                          Owns the identities (default
                          ~/.config/agent-office-chain/base-registrar.json)
      --reputation-card-base <https url>
                          Where this office is reached: agent cards are
                          <url>/agents/<id>.json
      --reputation-identity <0x>, --reputation-registry <0x>
                          Registries on a local node (default: the live
                          ERC-8004 ones on Base Sepolia)
      --reputation-index <minutes>
                          Rebuild the public board from the chain alone with
                          onchain/indexer every so often (default never)
`;
