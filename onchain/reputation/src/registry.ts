// Writing to the ERC-8004 registries: registering an office worker's identity, pointing it at its
// agent card, and giving it feedback for an outcome a person caused. Two keys, never one: the
// registrar owns the identities, the reviewer (the office's attester) gives the feedback, since the
// Reputation Registry refuses feedback from an agent's own owner or operator. Every write asks the
// node for its chain id first, and anything but Base Sepolia is refused (see chain.ts).

import { createPublicClient, createWalletClient, decodeEventLog, http, type Address, type Hex, type PrivateKeyAccount, type TransactionReceipt } from 'viem';
import { IDENTITY_ABI, REPUTATION_ABI } from './abi.js';
import { IDENTITY_REGISTRY, REPUTATION_REGISTRY, assertBaseSepolia, chainAt, txLink } from './chain.js';
import { readEvmKey } from './keyfile.js';

export interface RegistryOptions {
  rpcUrl: string;
  /** The signer's key file (mode 0600). Read once, here. */
  keyFile?: string;
  /** Tests: an account instead of a key file. */
  account?: PrivateKeyAccount;
  identity?: Address;
  reputation?: Address;
  /** How JSON-RPC goes out (the office passes its guarded fetch). */
  fetchFn?: typeof fetch;
  receiptTimeoutMs?: number;
}

export interface Feedback {
  agentId: bigint;
  /** 0 to 100 for the office's outcomes (see SCORE in the office's shared/reputation.ts). */
  value: number;
  valueDecimals?: number;
  /** 'merge', 'paid' or 'self'. */
  tag1: string;
  /** The harness. */
  tag2: string;
  endpoint?: string;
  /** Where the outcome can be checked: the EAS attestation on easscan. */
  feedbackURI: string;
  /** The attestation UID. */
  feedbackHash: Hex;
}

export interface Registry {
  readonly address: Address;
  readonly identity: Address;
  readonly reputation: Address;
  checkChain(): Promise<void>;
  /** `onSent` gets the hash as soon as it's sent, to keep: a retry then looks it up (registered()) rather than registering again. */
  register(agentURI?: string, onSent?: (hash: Hex) => void): Promise<{ agentId: bigint; tx: Hex; link: string }>;
  /** A registration sent earlier, looked up again: its agent id, 'pending' while not mined, 'missing' when the node never heard of it, 'failed' when it reverted. */
  registered(hash: Hex): Promise<{ agentId: bigint; tx: Hex; link: string } | 'pending' | 'missing' | 'failed'>;
  setAgentURI(agentId: bigint, uri: string): Promise<{ tx: Hex }>;
  giveFeedback(f: Feedback): Promise<{ tx: Hex; index: bigint; link: string }>;
}

const TAG = /^[a-z0-9_-]{1,32}$/;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;

/** Why a feedback can't be given, or undefined. */
export function feedbackProblem(f: Feedback): string | undefined {
  if (typeof f.agentId !== 'bigint' || f.agentId < 0n) return 'agentId is a non-negative bigint';
  if (!Number.isSafeInteger(f.value) || f.value < -100 || f.value > 100) return 'value is a whole number from -100 to 100';
  if (f.valueDecimals !== undefined && (!Number.isInteger(f.valueDecimals) || f.valueDecimals < 0 || f.valueDecimals > 18)) return 'valueDecimals is 0 to 18';
  if (!TAG.test(f.tag1) || !TAG.test(f.tag2)) return 'tags are short lower-case names';
  if (f.feedbackURI.length > 300 || (f.feedbackURI && !/^https:\/\//.test(f.feedbackURI))) return 'feedbackURI is an https link';
  if (!HEX32.test(f.feedbackHash)) return 'feedbackHash is 32 bytes of hex';
  return undefined;
}

export function createRegistry(o: RegistryOptions): Registry {
  const account = o.account ?? (o.keyFile ? readEvmKey(o.keyFile) : undefined);
  if (!account) throw new Error('A key file is needed');
  const chain = chainAt(o.rpcUrl);
  const transport = http(o.rpcUrl, { ...(o.fetchFn ? { fetchFn: o.fetchFn } : {}), timeout: 30_000, retryCount: 0 });
  const pub = createPublicClient({ chain, transport });
  const wallet = createWalletClient({ account, chain, transport });
  const identity = o.identity ?? IDENTITY_REGISTRY;
  const reputation = o.reputation ?? REPUTATION_REGISTRY;
  const timeout = o.receiptTimeoutMs ?? 120_000;
  const checkChain = async () => assertBaseSepolia(await pub.getChainId());

  const mined = async (hash: Hex) => {
    const receipt = await pub.waitForTransactionReceipt({ hash, timeout });
    if (receipt.status !== 'success') throw new Error(`The transaction failed: ${hash}`);
    return receipt;
  };

  /** The agent id a mined registration made. */
  const registeredIn = (hash: Hex, receipt: TransactionReceipt) => {
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== identity.toLowerCase()) continue;
      try {
        const ev = decodeEventLog({ abi: IDENTITY_ABI, data: log.data, topics: log.topics });
        if (ev.eventName === 'Registered') return { agentId: ev.args.agentId, tx: hash, link: txLink(hash) };
      } catch {
        // a Transfer or MetadataSet
      }
    }
    throw new Error(`No Registered event in ${hash}`);
  };

  return {
    address: account.address,
    identity,
    reputation,
    checkChain,
    async register(agentURI, onSent) {
      await checkChain();
      const hash = agentURI
        ? await wallet.writeContract({ address: identity, abi: IDENTITY_ABI, functionName: 'register', args: [agentURI] })
        : await wallet.writeContract({ address: identity, abi: IDENTITY_ABI, functionName: 'register', args: [] });
      onSent?.(hash);
      return registeredIn(hash, await mined(hash));
    },
    async registered(hash) {
      const receipt = await pub.getTransactionReceipt({ hash }).catch(() => undefined);
      if (receipt) return receipt.status === 'success' ? registeredIn(hash, receipt) : 'failed';
      return (await pub.getTransaction({ hash }).catch(() => undefined)) ? 'pending' : 'missing';
    },
    async setAgentURI(agentId, uri) {
      await checkChain();
      const hash = await wallet.writeContract({ address: identity, abi: IDENTITY_ABI, functionName: 'setAgentURI', args: [agentId, uri] });
      await mined(hash);
      return { tx: hash };
    },
    async giveFeedback(f) {
      const bad = feedbackProblem(f);
      if (bad) throw new Error(`Not a feedback: ${bad}`);
      await checkChain();
      // The registry would revert; say why first.
      if (await pub.readContract({ address: identity, abi: IDENTITY_ABI, functionName: 'isAuthorizedOrOwner', args: [account.address, f.agentId] })) {
        throw new Error(`${account.address} owns or operates agent ${f.agentId}: it may not give it feedback`);
      }
      const hash = await wallet.writeContract({
        address: reputation,
        abi: REPUTATION_ABI,
        functionName: 'giveFeedback',
        args: [f.agentId, BigInt(f.value), f.valueDecimals ?? 0, f.tag1, f.tag2, f.endpoint ?? '', f.feedbackURI, f.feedbackHash],
      });
      const receipt = await mined(hash);
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== reputation.toLowerCase()) continue;
        try {
          const ev = decodeEventLog({ abi: REPUTATION_ABI, data: log.data, topics: log.topics });
          if (ev.eventName === 'NewFeedback') return { tx: hash, index: ev.args.feedbackIndex, link: txLink(hash) };
        } catch {
          // another event
        }
      }
      throw new Error(`No NewFeedback event in ${hash}`);
    },
  };
}
