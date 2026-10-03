// Writing Proof of Merge attestations: to EAS (the schema registered by scripts/register-schema.ts),
// or to the MergeAttestor fallback contract, behind one interface. The key comes from a key file.
// Before every transaction the node is asked for its chain id, and anything but Base Sepolia is
// refused (see chain.ts).

import { createPublicClient, createWalletClient, decodeEventLog, http, type Address, type Hex, type PrivateKeyAccount } from 'viem';
import { EAS_ABI, MERGE_ATTESTOR_ABI } from './abi.js';
import { EAS_ADDRESS, assertBaseSepolia, chainAt, easLink, txLink } from './chain.js';
import { readEvmKey } from './keyfile.js';
import { ZERO32, encodeMerge, type MergeRecord } from './schema.js';

export interface AttestorOptions {
  rpcUrl: string;
  /** The attester's key file (mode 0600). Read once, here. */
  keyFile?: string;
  /** Tests: an account instead of a key file. */
  account?: PrivateKeyAccount;
  /** 'eas' (default) or 'event' (the MergeAttestor fallback). */
  mode?: 'eas' | 'event';
  schemaUid?: Hex;
  /** EAS: the Base predeploy unless a test deployed its own. */
  eas?: Address;
  /** 'event' mode: the MergeAttestor contract. */
  mergeAttestor?: Address;
  /** How JSON-RPC goes out (the office passes its guarded fetch). */
  fetchFn?: typeof fetch;
  /** Milliseconds to wait for a receipt. */
  receiptTimeoutMs?: number;
}

export interface Attested {
  uid: Hex;
  tx: Hex;
  /** Where a person can look at it. */
  link: string;
}

export interface Attestor {
  readonly address: Address;
  readonly mode: 'eas' | 'event';
  /** Throws WrongChainError unless the node is on Base Sepolia. */
  checkChain(): Promise<void>;
  attest(record: MergeRecord, refUid?: Hex): Promise<Attested>;
  revoke(uid: Hex): Promise<{ tx: Hex }>;
}

export function createAttestor(o: AttestorOptions): Attestor {
  const mode = o.mode ?? 'eas';
  if (mode === 'eas' && !o.schemaUid) throw new Error('EAS attestations need the schema UID (deployments/base-sepolia.json, or register it first)');
  if (mode === 'event' && !o.mergeAttestor) throw new Error('The fallback needs the MergeAttestor address');
  const account = o.account ?? (o.keyFile ? readEvmKey(o.keyFile) : undefined);
  if (!account) throw new Error('An attester key file is needed');
  const chain = chainAt(o.rpcUrl);
  const transport = http(o.rpcUrl, { ...(o.fetchFn ? { fetchFn: o.fetchFn } : {}), timeout: 30_000, retryCount: 0 });
  const pub = createPublicClient({ chain, transport });
  const wallet = createWalletClient({ account, chain, transport });
  const eas = o.eas ?? EAS_ADDRESS;
  const timeout = o.receiptTimeoutMs ?? 120_000;

  const checkChain = async () => assertBaseSepolia(await pub.getChainId());

  return {
    address: account.address,
    mode,
    checkChain,
    async attest(record, refUid = ZERO32) {
      const data = encodeMerge(record);
      await checkChain();
      if (mode === 'eas') {
        const hash = await wallet.writeContract({
          address: eas,
          abi: EAS_ABI,
          functionName: 'attest',
          args: [{ schema: o.schemaUid!, data: { recipient: '0x0000000000000000000000000000000000000000', expirationTime: 0n, revocable: true, refUID: refUid, data, value: 0n } }],
        });
        const receipt = await pub.waitForTransactionReceipt({ hash, timeout });
        if (receipt.status !== 'success') throw new Error(`The attestation transaction failed: ${hash}`);
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== eas.toLowerCase()) continue;
          try {
            const ev = decodeEventLog({ abi: EAS_ABI, data: log.data, topics: log.topics });
            if (ev.eventName === 'Attested') return { uid: ev.args.uid, tx: hash, link: easLink(ev.args.uid) };
          } catch {
            // another event
          }
        }
        throw new Error(`No Attested event in ${hash}`);
      }
      const hash = await wallet.writeContract({ address: o.mergeAttestor!, abi: MERGE_ATTESTOR_ABI, functionName: 'attest', args: [data, refUid] });
      const receipt = await pub.waitForTransactionReceipt({ hash, timeout });
      if (receipt.status !== 'success') throw new Error(`The attestation transaction failed: ${hash}`);
      for (const log of receipt.logs) {
        try {
          const ev = decodeEventLog({ abi: MERGE_ATTESTOR_ABI, data: log.data, topics: log.topics });
          if (ev.eventName === 'MergeAttested') return { uid: ev.args.uid, tx: hash, link: txLink(hash) };
        } catch {
          // another event
        }
      }
      throw new Error(`No MergeAttested event in ${hash}`);
    },
    async revoke(uid) {
      await checkChain();
      const hash =
        mode === 'eas'
          ? await wallet.writeContract({ address: eas, abi: EAS_ABI, functionName: 'revoke', args: [{ schema: o.schemaUid!, data: { uid, value: 0n } }] })
          : await wallet.writeContract({ address: o.mergeAttestor!, abi: MERGE_ATTESTOR_ABI, functionName: 'revoke', args: [uid] });
      const receipt = await pub.waitForTransactionReceipt({ hash, timeout });
      if (receipt.status !== 'success') throw new Error(`The revocation failed: ${hash}`);
      return { tx: hash };
    },
  };
}
