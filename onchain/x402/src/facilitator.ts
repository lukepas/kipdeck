// Facilitators that run here instead of x402.org's, for tests and the local end-to-end run.
//
// MockFacilitator checks payments the way a real one does (the EIP-712 signature is really recovered,
// and amount, payee, token, network, time window and nonce are all checked) but "settles" them in
// memory with a made-up transaction hash, so nothing touches a chain.
//
// chainFacilitator is @x402/evm's own facilitator scheme with a viem wallet: pointed at a local anvil
// it really calls transferWithAuthorization on the TestUSDC token and waits for the receipt.
//
// serveFacilitator puts either one behind the HTTP endpoints the office calls (POST /verify,
// POST /settle, GET /supported), on 127.0.0.1 only.

import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { x402Facilitator } from '@x402/core/facilitator';
import { toFacilitatorEvmSigner } from '@x402/evm';
import { registerExactEvmScheme } from '@x402/evm/exact/facilitator';
import { createWalletClient, http as httpTransport, isAddress, keccak256, publicActions, verifyTypedData, concat, type Chain } from 'viem';
import type { LocalAccount } from 'viem/accounts';
import { NETWORKS, X402_VERSION, isMainnet, type Hex, type PaymentPayload, type PaymentRequirements, type SettleResponse, type VerifyResponse } from './networks.js';

export interface FacilitatorRequest {
  x402Version?: number;
  paymentPayload?: PaymentPayload;
  paymentRequirements?: PaymentRequirements;
}

export interface Facilitator {
  supported(): unknown;
  verify(req: FacilitatorRequest): Promise<VerifyResponse>;
  settle(req: FacilitatorRequest): Promise<SettleResponse>;
}

export const TRANSFER_WITH_AUTHORIZATION = [
  { name: 'from', type: 'address' },
  { name: 'to', type: 'address' },
  { name: 'value', type: 'uint256' },
  { name: 'validAfter', type: 'uint256' },
  { name: 'validBefore', type: 'uint256' },
  { name: 'nonce', type: 'bytes32' },
] as const;

interface Authorization {
  from: Hex;
  to: Hex;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: Hex;
}

const isHex = (v: unknown, bytes: number) => typeof v === 'string' && v.length === 2 + bytes * 2 && /^0x[0-9a-fA-F]*$/.test(v);

/** The EIP-3009 authorization in an exact EVM payload, if it has one. */
export function authorizationOf(p: PaymentPayload | undefined): { signature: Hex; authorization: Authorization } | undefined {
  const payload = p?.payload as { signature?: unknown; authorization?: Authorization } | undefined;
  const a = payload?.authorization;
  if (!a || typeof payload?.signature !== 'string' || !/^0x[0-9a-fA-F]+$/.test(payload.signature)) return undefined;
  if (!isAddress(a.from) || !isAddress(a.to) || !isHex(a.nonce, 32)) return undefined;
  if (![a.value, a.validAfter, a.validBefore].every((v) => typeof v === 'string' && /^\d{1,78}$/.test(v))) return undefined;
  return { signature: payload.signature as Hex, authorization: a };
}

export interface MockFacilitatorOptions {
  /** CAIP-2 networks it takes; default Base Sepolia. */
  networks?: string[];
  /** Token balances by payer address (atomic units). A payer not listed has plenty. */
  balances?: Record<string, bigint>;
  /** Seconds since the epoch. */
  now?: () => number;
}

export interface MockSettlement {
  transaction: Hex;
  payer: string;
  to: string;
  amount: string;
  network: string;
  nonce: string;
}

const SAME_FIELDS = ['scheme', 'network', 'amount', 'asset', 'payTo'] as const;

export class MockFacilitator implements Facilitator {
  readonly networks: string[];
  readonly settlements: MockSettlement[] = [];
  readonly calls = { verify: 0, settle: 0, supported: 0 };
  private used = new Set<string>();
  private balances: Map<string, bigint>;
  private now: () => number;

  constructor(opts: MockFacilitatorOptions = {}) {
    this.networks = opts.networks ?? [NETWORKS['base-sepolia'].caip2];
    if (this.networks.some(isMainnet)) throw new Error('The mock facilitator takes testnets only');
    this.balances = new Map(Object.entries(opts.balances ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    this.now = opts.now ?? (() => Math.floor(Date.now() / 1000));
  }

  supported() {
    this.calls.supported++;
    return { kinds: this.networks.map((network) => ({ x402Version: X402_VERSION, scheme: 'exact', network })), extensions: [], signers: { 'eip155:*': [] } };
  }

  async verify(req: FacilitatorRequest): Promise<VerifyResponse> {
    this.calls.verify++;
    return this.check(req);
  }

  async settle(req: FacilitatorRequest): Promise<SettleResponse> {
    this.calls.settle++;
    const network = (req.paymentRequirements?.network ?? '') as SettleResponse['network'];
    const checked = await this.check(req);
    if (!checked.isValid) return { success: false, errorReason: checked.invalidReason, payer: checked.payer, transaction: '', network };
    const { authorization: auth } = authorizationOf(req.paymentPayload)!;
    this.used.add(auth.nonce.toLowerCase());
    const from = auth.from.toLowerCase();
    const balance = this.balances.get(from);
    if (balance !== undefined) this.balances.set(from, balance - BigInt(auth.value));
    const transaction = keccak256(concat([auth.nonce, auth.from]));
    this.settlements.push({ transaction, payer: auth.from, to: auth.to, amount: auth.value, network, nonce: auth.nonce });
    return { success: true, payer: auth.from, transaction, network, amount: auth.value };
  }

  private async check(req: FacilitatorRequest): Promise<VerifyResponse> {
    const invalid = (invalidReason: string, payer?: string): VerifyResponse => ({ isValid: false, invalidReason, ...(payer ? { payer } : {}) });
    const payment = req?.paymentPayload;
    const reqs = req?.paymentRequirements;
    if (req?.x402Version !== X402_VERSION || payment?.x402Version !== X402_VERSION) return invalid('invalid_x402_version');
    if (!reqs || typeof reqs !== 'object') return invalid('invalid_payment_requirements');
    if (reqs.scheme !== 'exact') return invalid('unsupported_scheme');
    if (!this.networks.includes(reqs.network)) return invalid('invalid_network');
    const found = authorizationOf(payment);
    if (!found) return invalid('invalid_payload');
    const { authorization: auth, signature } = found;
    const accepted = payment.accepted;
    if (!accepted || SAME_FIELDS.some((f) => String(accepted[f]).toLowerCase() !== String(reqs[f]).toLowerCase())) return invalid('invalid_payment_requirements', auth.from);
    const extra = (reqs.extra ?? {}) as { name?: string; version?: string };
    let good = false;
    try {
      good = await verifyTypedData({
        address: auth.from,
        domain: { name: extra.name, version: extra.version, chainId: Number(reqs.network.split(':')[1]), verifyingContract: reqs.asset as Hex },
        types: { TransferWithAuthorization: TRANSFER_WITH_AUTHORIZATION },
        primaryType: 'TransferWithAuthorization',
        message: { from: auth.from, to: auth.to, value: BigInt(auth.value), validAfter: BigInt(auth.validAfter), validBefore: BigInt(auth.validBefore), nonce: auth.nonce },
        signature,
      });
    } catch {
      good = false;
    }
    if (!good) return invalid('invalid_exact_evm_payload_signature', auth.from);
    if (auth.to.toLowerCase() !== reqs.payTo.toLowerCase()) return invalid('invalid_exact_evm_payload_recipient_mismatch', auth.from);
    if (auth.value !== reqs.amount) return invalid('invalid_exact_evm_payload_authorization_value_mismatch', auth.from);
    const now = this.now();
    if (BigInt(auth.validAfter) > BigInt(now)) return invalid('invalid_exact_evm_payload_authorization_valid_after', auth.from);
    // Room for the settling transaction to land before it runs out, as the reference facilitator leaves.
    if (BigInt(auth.validBefore) < BigInt(now + 6)) return invalid('invalid_exact_evm_payload_authorization_valid_before', auth.from);
    if (this.used.has(auth.nonce.toLowerCase())) return invalid('invalid_transaction_state', auth.from);
    const balance = this.balances.get(auth.from.toLowerCase());
    if (balance !== undefined && balance < BigInt(auth.value)) return invalid('insufficient_funds', auth.from);
    return { isValid: true, payer: auth.from };
  }
}

/** A chain with just what viem needs to talk to it. */
export function chainOf(chainId: number, rpc: string, name = `chain ${chainId}`): Chain {
  return { id: chainId, name, nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } };
}

/**
 * @x402/evm's facilitator for the exact scheme, settling with `account` (which pays the gas) over
 * `rpc`. Testnets and local chains only.
 */
export function chainFacilitator(opts: { account: LocalAccount; rpc: string; chainId: number; fetch?: typeof fetch }): Facilitator {
  const network = `eip155:${opts.chainId}` as const;
  if (isMainnet(network)) throw new Error('This facilitator settles on testnets only');
  const client = createWalletClient({ account: opts.account, chain: chainOf(opts.chainId, opts.rpc), transport: httpTransport(opts.rpc, { fetchFn: opts.fetch, timeout: 30_000 }) }).extend(publicActions);
  const signer = toFacilitatorEvmSigner({ ...(client as unknown as Parameters<typeof toFacilitatorEvmSigner>[0]), address: opts.account.address }, { confirmationTimeoutMs: 60_000 });
  const f = new x402Facilitator();
  registerExactEvmScheme(f, { signer, networks: network });
  const call = async <T>(what: 'verify' | 'settle', req: FacilitatorRequest): Promise<T> => {
    if (!req.paymentPayload || !req.paymentRequirements) throw new Error(`${what} needs paymentPayload and paymentRequirements`);
    return (what === 'verify' ? f.verify(req.paymentPayload, req.paymentRequirements) : f.settle(req.paymentPayload, req.paymentRequirements)) as Promise<T>;
  };
  return { supported: () => f.getSupported(), verify: (r) => call('verify', r), settle: (r) => call('settle', r) };
}

export interface ServedFacilitator {
  url: string;
  facilitator: Facilitator;
  close(): Promise<void>;
}

/** Serves a facilitator over HTTP on 127.0.0.1. With `token`, requests must carry it as a bearer token. */
export function serveFacilitator(facilitator: Facilitator = new MockFacilitator(), opts: { port?: number; token?: string } = {}): Promise<ServedFacilitator> {
  const server = http.createServer((req, res) => {
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
    };
    if (opts.token && req.headers.authorization !== `Bearer ${opts.token}`) return reply(401, { error: 'unauthorized' });
    const path = new URL(req.url ?? '/', 'http://x').pathname.replace(/\/+$/, '');
    if (req.method === 'GET' && path === '/supported') return reply(200, facilitator.supported());
    if (req.method !== 'POST' || (path !== '/verify' && path !== '/settle')) return reply(404, { error: 'not found' });
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => {
      body += c;
      if (body.length > 64 * 1024) req.destroy();
    });
    req.on('end', () => {
      let parsed: FacilitatorRequest;
      try {
        parsed = JSON.parse(body);
      } catch {
        return reply(400, { error: 'invalid json' });
      }
      (path === '/verify' ? facilitator.verify(parsed) : facilitator.settle(parsed)).then(
        (r) => reply(200, r),
        (e: Error) => reply(500, { error: e.message.slice(0, 300) }),
      );
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? 0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        facilitator,
        close: () =>
          new Promise<void>((r) => {
            server.close(() => r());
            server.closeAllConnections();
          }),
      });
    });
  });
}
